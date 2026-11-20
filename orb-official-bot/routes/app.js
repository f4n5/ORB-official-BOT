/**
 * API para la app de escritorio ORBstrap.
 *
 *   GET  /api/app/config            → datos públicos (invitación al servidor, si hay "Show in Discord")
 *   POST /api/app/login/start       → inicia un login: devuelve code + secret + loginUrl
 *   GET  /app/login?code=...        → (navegador) redirige al login de Discord
 *   GET  /api/app/login/poll        → la app pregunta si el login ya terminó
 *   GET  /api/app/me                → (Bearer) revalida que sigue en el servidor y verificado
 *   POST /api/app/show              → (Bearer) "Show in Discord": publica / quita el estado "jugando"
 *
 * Reglas de acceso: la persona debe estar en el servidor (GUILD_ID), tener el rol Miembro
 * (se obtiene verificándose con el CAPTCHA del bot) y no tener el rol Banned.
 */
const express = require('express');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { signToken, verifyToken } = require('../utils/tokens');

const LOGIN_TTL = 10 * 60 * 1000;               // el login debe completarse en 10 min
const APP_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // sesión de la app: 30 días (se renueva al usar /me)
const SHOW_MIN_INTERVAL = 15 * 1000;            // mínimo entre publicaciones de "Show in Discord" por usuario
const SHOW_MAX_AGE = 12 * 60 * 60 * 1000;       // si la app no avisa de que paró, se borra a las 12 h

// ---------- utilidades ----------
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest(); }

function safeEqualHash(a, b) {
  return crypto.timingSafeEqual(sha(a), sha(b));
}

/** Limitador simple en memoria (ventana fija) por IP. */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    let h = hits.get(key);
    if (!h || now > h.reset) { h = { count: 0, reset: now + windowMs }; hits.set(key, h); }
    h.count++;
    if (h.count > max) {
      return res.status(429).json({ ok: false, reason: 'rate_limited', error: 'Demasiadas solicitudes. Espera un momento.' });
    }
    next();
  };
}

/** Quita menciones, formato Markdown y saltos de línea de un texto que viene de fuera. */
function cleanText(s, max = 40) {
  return String(s ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/<[^>]*>/g, '')          // menciones/emojis personalizados <...>
    .replace(/[`*_~|<>\\@#]/g, '')   // formato Markdown y caracteres de mención
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

module.exports = function createAppApi({ client, statusPage, esc }) {
  const router = express.Router();
  const loginSessions = new Map(); // code → { secret, status, createdAt, result }
  const showMessages = new Map();  // userId → { channelId, messageId, startedAt, lastPost }
  const memberCache = new Map();   // userId → { at, result }  (evita consultar a Discord en cada /me)

  setInterval(() => {
    const now = Date.now();
    for (const [code, s] of loginSessions) if (now - s.createdAt > LOGIN_TTL + 60 * 1000) loginSessions.delete(code);
    for (const [id, c] of memberCache) if (now - c.at > 60 * 1000) memberCache.delete(id);
    // "Show in Discord" huérfanos (la app se cerró sin avisar)
    for (const [userId, s] of showMessages) {
      if (now - s.startedAt > SHOW_MAX_AGE) { removeShowMessage(userId).catch(() => {}); }
    }
  }, 60 * 1000).unref();

  // ---------- acceso: ¿está en el servidor y verificado? ----------
  async function getGuild() {
    if (config.guildId) {
      return client.guilds.cache.get(config.guildId) || await client.guilds.fetch(config.guildId).catch(() => null);
    }
    return client.guilds.cache.first() || null;
  }

  /**
   * @returns {Promise<{ok:true, member:object}|{ok:false, reason:'not_in_server'|'not_verified'|'banned'|'server_error'}>}
   */
  async function checkMembership(userId) {
    const cached = memberCache.get(userId);
    if (cached && Date.now() - cached.at < 20 * 1000) return cached.result;

    let result;
    try {
      const guild = await getGuild();
      if (!guild) {
        result = { ok: false, reason: 'server_error' };
      } else {
        let member = guild.members.cache.get(userId) || null;
        if (!member) {
          try {
            member = await guild.members.fetch(userId);
          } catch (e) {
            if (e && e.code === 10007) member = null;   // Unknown Member → no está en el servidor
            else throw e;
          }
        }
        if (!member) {
          result = { ok: false, reason: 'not_in_server' };
        } else {
          const bannedRole = guild.roles.cache.find(r => r.name === config.roles.banned);
          const memberRole = guild.roles.cache.find(r => r.name === config.roles.member);
          if (bannedRole && member.roles.cache.has(bannedRole.id)) result = { ok: false, reason: 'banned' };
          else if (!memberRole || !member.roles.cache.has(memberRole.id)) result = { ok: false, reason: 'not_verified' };
          else result = { ok: true, member };
        }
      }
    } catch (err) {
      console.error('[app] checkMembership:', err.message);
      return { ok: false, reason: 'server_error' }; // no se cachea
    }
    memberCache.set(userId, { at: Date.now(), result });
    return result;
  }

  function displayInfo(member) {
    const user = member.user || {};
    const name = cleanText(member.displayName || user.globalName || user.username || 'usuario', 32) || 'usuario';
    const avatar = typeof member.displayAvatarURL === 'function'
      ? member.displayAvatarURL({ extension: 'png', size: 64 })
      : (typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ extension: 'png', size: 64 }) : null);
    return { id: member.id || user.id, name, avatarUrl: avatar };
  }

  function issueAppToken(info) {
    return signToken('app', { id: info.id, u: info.name }, APP_TOKEN_TTL);
  }

  // ---------- autenticación Bearer ----------
  function requireApp(req, res, next) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const v = verifyToken(token, 'app');
    if (!v.ok) return res.status(401).json({ ok: false, reason: v.reason === 'expired' ? 'expired' : 'invalid', error: 'Sesión no válida. Inicia sesión de nuevo.' });
    req.appUser = { id: String(v.payload.id), name: v.payload.u };
    next();
  }

  const REASON_TEXT = {
    not_in_server: 'Primero debes unirte al servidor de Discord.',
    not_verified: 'Estás en el servidor, pero aún no te has verificado. Pulsa el botón «Verificar» en Discord.',
    banned: 'Tu cuenta no tiene acceso.',
    server_error: 'No pude comprobar tu cuenta ahora mismo. Inténtalo de nuevo en un minuto.'
  };

  // ---------- público ----------
  router.get('/api/app/config', rateLimit({ windowMs: 60 * 1000, max: 60 }), (req, res) => {
    res.json({
      ok: true,
      name: 'ORB official bot',
      inviteUrl: config.inviteUrl || null,
      showEnabled: Boolean(config.showChannelId)
    });
  });

  // ---------- login (flujo por código) ----------
  router.post('/api/app/login/start', rateLimit({ windowMs: 10 * 60 * 1000, max: 30 }), (req, res) => {
    if (loginSessions.size > 5000) return res.status(503).json({ ok: false, reason: 'busy', error: 'Servidor ocupado.' });
    const code = crypto.randomBytes(9).toString('base64url');
    const secret = crypto.randomBytes(24).toString('base64url');
    loginSessions.set(code, { secret, status: 'pending', createdAt: Date.now(), result: null });
    res.json({
      ok: true,
      code,
      secret,
      loginUrl: `${config.publicUrl}/app/login?code=${encodeURIComponent(code)}`,
      expiresIn: LOGIN_TTL / 1000
    });
  });

  // El navegador llega aquí desde la app → redirige a Discord
  router.get('/app/login', rateLimit({ windowMs: 60 * 1000, max: 30 }), (req, res) => {
    const code = String(req.query.code || '');
    const s = loginSessions.get(code);
    if (!s || Date.now() - s.createdAt > LOGIN_TTL) {
      return res.status(400).send(statusPage('Enlace expirado',
        '<h2>⏳ El enlace expiró</h2><p>Vuelve a ORBstrap y pulsa «Iniciar sesión» otra vez.</p>', { color: '#ed4245' }));
    }
    const state = signToken('oauth', { intent: 'app', lc: code }, LOGIN_TTL);
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${config.publicUrl}/auth/discord/callback`,
      response_type: 'code',
      scope: 'identify',
      state
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
  });

  /**
   * Lo llama index.js desde el callback de OAuth cuando intent === 'app'.
   * @returns {Promise<{status:number, html:string}>}
   */
  async function finishLogin(code, discordUser) {
    const s = loginSessions.get(String(code));
    if (!s || Date.now() - s.createdAt > LOGIN_TTL) {
      return { status: 400, html: statusPage('Enlace expirado',
        '<h2>⏳ El enlace expiró</h2><p>Vuelve a ORBstrap y pulsa «Iniciar sesión» otra vez.</p>', { color: '#ed4245' }) };
    }
    if (s.status !== 'pending') {
      return { status: 200, html: statusPage('ORBstrap', '<h2>Ya completaste este inicio de sesión</h2><p>Vuelve a ORBstrap.</p>') };
    }

    const check = await checkMembership(String(discordUser.id));
    if (!check.ok) {
      s.status = 'denied';
      s.result = { reason: check.reason };
      const invite = config.inviteUrl && check.reason === 'not_in_server'
        ? `<a class="btn" href="${esc(config.inviteUrl)}">Unirme al servidor</a>` : '';
      return { status: 403, html: statusPage('ORBstrap', `<h2>🔒 No se pudo dar acceso</h2>
        <p>${esc(REASON_TEXT[check.reason] || REASON_TEXT.server_error)}</p>
        <p>Cuando lo hayas hecho, vuelve a ORBstrap y pulsa «Iniciar sesión» otra vez.</p>${invite}`, { color: '#FEE75C' }) };
    }

    const info = displayInfo(check.member);
    s.status = 'approved';
    s.result = { token: issueAppToken(info), user: info };
    return { status: 200, html: statusPage('ORBstrap', `<h2>✅ ¡Listo, ${esc(info.name)}!</h2>
      <p>Tu cuenta fue verificada. Ya puedes volver a <strong>ORBstrap</strong>: se abrirá sola.</p>
      <p style="color:#949ba4">Puedes cerrar esta pestaña.</p>`, { color: '#57F287' }) };
  }

  // La app pregunta cada ~2 s
  router.get('/api/app/login/poll', rateLimit({ windowMs: 60 * 1000, max: 120 }), (req, res) => {
    const code = String(req.query.code || '');
    const secret = String(req.query.secret || '');
    const s = loginSessions.get(code);
    if (!s || !safeEqualHash(s.secret, secret)) return res.status(404).json({ ok: false, status: 'unknown', reason: 'unknown' });
    if (Date.now() - s.createdAt > LOGIN_TTL) {
      loginSessions.delete(code);
      return res.json({ ok: false, status: 'expired', reason: 'expired' });
    }
    if (s.status === 'pending') return res.json({ ok: true, status: 'pending' });

    loginSessions.delete(code); // el resultado se entrega una sola vez
    if (s.status === 'approved') return res.json({ ok: true, status: 'approved', token: s.result.token, user: s.result.user });
    return res.json({ ok: false, status: 'denied', reason: s.result.reason, error: REASON_TEXT[s.result.reason] || REASON_TEXT.server_error });
  });

  // ---------- sesión ----------
  router.get('/api/app/me', rateLimit({ windowMs: 60 * 1000, max: 60 }), requireApp, async (req, res) => {
    const check = await checkMembership(req.appUser.id);
    if (!check.ok) {
      const status = check.reason === 'server_error' ? 503 : 403;
      return res.status(status).json({ ok: false, reason: check.reason, error: REASON_TEXT[check.reason] });
    }
    const info = displayInfo(check.member);
    res.json({ ok: true, user: info, token: issueAppToken(info) }); // renueva la sesión
  });

  // ---------- Show in Discord ----------
  async function getShowChannel() {
    if (!config.showChannelId) return null;
    const ch = client.channels.cache.get(config.showChannelId) || await client.channels.fetch(config.showChannelId).catch(() => null);
    return ch && ch.isTextBased() ? ch : null;
  }

  async function removeShowMessage(userId) {
    const entry = showMessages.get(userId);
    if (!entry) return;
    showMessages.delete(userId);
    const ch = await getShowChannel();
    if (!ch) return;
    const msg = await ch.messages.fetch(entry.messageId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }

  function showEmbed({ name, avatarUrl, startedAt }) {
    const e = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle(`🟣 ${name} está jugando Roblox`)
      .setDescription(`Con **ORBstrap** · desde <t:${Math.floor(startedAt / 1000)}:R>`)
      .setFooter({ text: 'ORB official bot' });
    if (avatarUrl) e.setThumbnail(avatarUrl);
    return e;
  }

  router.post('/api/app/show', rateLimit({ windowMs: 60 * 1000, max: 20 }), requireApp, async (req, res) => {
    const { action, showName } = req.body || {};
    const userId = req.appUser.id;

    if (!config.showChannelId) return res.status(501).json({ ok: false, reason: 'disabled', error: 'Show in Discord no está activado en el servidor.' });
    if (action !== 'start' && action !== 'stop') return res.status(400).json({ ok: false, reason: 'bad_request', error: 'action debe ser "start" o "stop".' });

    try {
      if (action === 'stop') {
        await removeShowMessage(userId);
        return res.json({ ok: true });
      }

      // start: solo para miembros verificados
      const check = await checkMembership(userId);
      if (!check.ok) return res.status(403).json({ ok: false, reason: check.reason, error: REASON_TEXT[check.reason] });

      const prev = showMessages.get(userId);
      if (prev && Date.now() - prev.lastPost < SHOW_MIN_INTERVAL) {
        return res.status(429).json({ ok: false, reason: 'rate_limited', error: 'Espera unos segundos.' });
      }

      const ch = await getShowChannel();
      if (!ch) return res.status(502).json({ ok: false, reason: 'channel', error: 'No encuentro el canal de Show in Discord.' });

      const info = displayInfo(check.member);
      const name = showName === false ? 'Un jugador' : info.name;
      const payload = {
        embeds: [showEmbed({ name, avatarUrl: showName === false ? null : info.avatarUrl, startedAt: prev ? prev.startedAt : Date.now() })],
        allowedMentions: { parse: [] } // nunca menciona a nadie
      };

      if (prev) {
        const msg = await ch.messages.fetch(prev.messageId).catch(() => null);
        if (msg) {
          await msg.edit(payload);
          prev.lastPost = Date.now();
          return res.json({ ok: true });
        }
      }
      const sent = await ch.send(payload);
      showMessages.set(userId, { channelId: ch.id, messageId: sent.id, startedAt: Date.now(), lastPost: Date.now() });
      res.json({ ok: true });
    } catch (err) {
      console.error('[app] show:', err.message);
      res.status(502).json({ ok: false, reason: 'discord', error: 'Discord rechazó la publicación (¿permisos del bot en el canal?).' });
    }
  });

  return { router, finishLogin, _test: { checkMembership, loginSessions, showMessages } };
};
