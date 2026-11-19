const { domainToUnicode } = require('url');
const config = require('../config');

// ============================================================
//  AJUSTES (puedes sobreescribirlos con config.automod = {...})
// ============================================================
const cfg = {
  maxMentions: 6,                                          // menciones (usuarios + roles) por mensaje
  duplicate: { count: 3, windowMs: 20 * 1000 },            // mismo mensaje X veces en Y ms
  strikes: { max: 3, windowMs: 10 * 60 * 1000, timeoutMs: 10 * 60 * 1000 },
  phishingTimeoutMs: 60 * 60 * 1000,                       // cuenta probablemente hackeada → 1h
  blockInvites: true,                                      // bloquea invites de OTROS servidores
  allowedInviteCodes: [],                                  // invites permitidos extra
  allowedDomains: [],                                      // dominios siempre permitidos (ej: 'discordbotlist.com')
  ...(config.automod || {})
};

const spamCfg = { maxMessages: 5, timeWindow: 7000, muteTime: 5 * 60 * 1000, ...(config.antiSpam || {}) };

// ============================================================
//  NORMALIZACIÓN (anti-evasión)
// ============================================================
const HOMOGLYPHS = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's',
  'ӏ': 'l', 'ɡ': 'g', 'ο': 'o', 'ν': 'v', 'ι': 'i', 'α': 'a', 'ε': 'e', 'ρ': 'p', 'τ': 't', 'κ': 'k'
};
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i', '¡': 'i', '+': 't' };

const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g;

function stripInvisible(s) {
  return String(s).replace(INVISIBLE_RE, '');
}

/** minúsculas, sin acentos, sin caracteres invisibles, homoglifos → latín */
function baseNormalize(text) {
  let s = stripInvisible(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  s = s.replace(/[^\u0000-\u007f]/g, ch => HOMOGLYPHS[ch] || ch);
  return s;
}

function leetNormalize(s) {
  return s.replace(/[0134578@$!|¡+]/g, c => LEET[c]);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// ============================================================
//  ANTI-WORDS  (palabra completa, no subcadena → "computo" ya no salta)
// ============================================================
// Permite: letras repetidas (niiigga), separadores (n.i.g.g.a / n i g g a),
// leetspeak (n1gg4), acentos, homoglifos cirílicos y plurales/sufijos.
function buildWordRegex(word) {
  const normalized = baseNormalize(word).trim();
  const parts = normalized.split(/\s+/).map(token =>
    [...token]
      .map(ch => (/[a-z0-9]/.test(ch) ? `${escapeRe(ch)}+` : escapeRe(ch)))
      .join('[^a-z0-9]{0,2}')
  );
  return new RegExp(`(?<![a-z0-9])${parts.join('[^a-z0-9]+')}(?:e?s|ed)?(?![a-z0-9])`, 'i');
}

let badWordRegexes = null;
function getBadWordRegexes() {
  if (!badWordRegexes) {
    badWordRegexes = (config.badWords || []).map(w => ({ word: w, re: buildWordRegex(w) }));
  }
  return badWordRegexes;
}

/** Devuelve la palabra prohibida detectada o null */
function findBadWord(content) {
  if (!content) return null;
  const plain = baseNormalize(content);
  const leet = leetNormalize(plain);
  for (const { word, re } of getBadWordRegexes()) {
    if (re.test(plain) || re.test(leet)) return word;
  }
  return null;
}

function isBadWord(content) {
  return findBadWord(content) !== null;
}

// ============================================================
//  ANTI-PHISHING  (analiza el HOSTNAME real, no el texto)
// ============================================================
const LEGIT_DOMAINS = [
  // Discord
  'discord.com', 'discord.gg', 'discordapp.com', 'discordapp.net', 'discord.media',
  'discord.gift', 'discord.new', 'discordstatus.com', 'discord.design', 'dis.gd',
  // Steam
  'steamcommunity.com', 'steampowered.com', 'steamstatic.com',
  // Roblox
  'roblox.com', 'rbxcdn.com', 'roblox.com.br'
];
const BRANDS = ['discord', 'roblox', 'steamcommunity', 'steampowered'];
const SHORTENERS = ['bit.ly', 'tinyurl.com', 'is.gd', 'cutt.ly', 'rb.gy', 'shorturl.at', 'goo.gl', 'ow.ly', 'tiny.cc', 't.ly', 'rebrand.ly', 'v.gd', 'buff.ly', 'shorte.st', 'adf.ly'];
const FREE_TLDS = ['tk', 'ml', 'ga', 'cf', 'gq'];
const SCAM_HOST_RE = /(free|gift|gratis|claim|promo|giveaway|airdrop|verif|login|auth|reward|drop|trade|wallet|staff|support)/;
const NITRO_PATH_RE = /(free|gift|claim|gratis)[-_./]*nitro|nitro[-_./]*(free|gift|claim|gratis|promo|giveaway)/;
const SCAM_PHRASE_RE = /free\s*nitro|nitro\s*(?:gift|giveaway|gratis|free)|gratis\s*nitro|regalo\s+de\s+nitro|steam\s*gift|claim\s+your\s+(?:gift|reward|prize|nitro)|airdrop|you(?:'|’)?ve\s+been\s+gifted|has\s+sido\s+seleccionado|discord\s+(?:staff|moderator)\s+(?:exam|program)/i;

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+|(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|net|org|xyz|tk|ml|ga|cf|gq|gg|gift|link|click|top|ru|io|me|co|app|dev|shop|store|site|online|live|ly|to|cc|info|biz|pw|ws|su)(?![a-z0-9-])(?:[/?#][^\s<>"'`]*)?/gi;
const MASK_RE = /\[([^\]]{1,200})\]\(\s*<?(https?:\/\/[^\s)>]+)>?\s*\)/gi;
const INVITE_RE = /(?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg|discord\.me|invite\.gg)\/([a-z0-9-]{2,32})/gi;

function trimUrl(raw) {
  return raw.replace(/[)\]}.,;:!?'"*_~|>]+$/, '');
}

function parseUrl(raw) {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch {
    return null;
  }
}

function cleanHost(u) {
  return u.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function isUnder(host, domain) {
  domain = domain.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function rootOf(host) {
  return host.split('.').slice(-2).join('.');
}

/** @returns {{severity:'low'|'high', reason:string}|null} */
function analyzeUrl(raw) {
  const u = parseUrl(raw);
  if (!u) return null;

  const host = cleanHost(u);
  if (!host) return null;

  if (cfg.allowedDomains.some(d => isUnder(host, d))) return null;
  if (LEGIT_DOMAINS.some(d => isUnder(host, d))) return null;

  // https://discord.com@evil.com  (truco de usuario@host)
  if (u.username || u.password) {
    let user = u.username;
    try { user = decodeURIComponent(user); } catch { /* ignore */ }
    if (user.includes('.')) return { severity: 'high', reason: 'truco usuario@dominio' };
    return { severity: 'low', reason: 'URL con credenciales' };
  }

  // discord.com.evil.xyz  → dominio legítimo usado como "subdominio" de otro
  if (LEGIT_DOMAINS.some(d => host.includes(`${d}.`) || host.includes(`${d.replace(/\./g, '-')}.`))) {
    return { severity: 'high', reason: 'dominio oficial falsificado como subdominio' };
  }

  const unicodeHost = baseNormalize(domainToUnicode(host) || host);
  const leetHost = leetNormalize(unicodeHost);
  const joined = leetHost.replace(/[.\-_]/g, '');
  const tokens = leetHost.split(/[.\-_]/).filter(Boolean);
  const scamHost = SCAM_HOST_RE.test(leetHost);

  // Imitación de marcas (disc0rd, dlscord, steamcommunnity...)
  for (const brand of BRANDS) {
    const contains = joined.includes(brand);
    const lookalike =
      !contains &&
      brand.length >= 6 &&
      tokens.some(t => Math.abs(t.length - brand.length) <= 1 && levenshtein(t, brand) <= 1);

    if (lookalike) return { severity: 'high', reason: `dominio que imita a ${brand}` };
    if (contains) {
      return scamHost
        ? { severity: 'high', reason: `dominio falso de ${brand}` }
        : { severity: 'low', reason: `dominio no oficial con "${brand}"` };
    }
  }

  if (joined.includes('nitro') && scamHost) return { severity: 'high', reason: 'falso Nitro' };
  if (NITRO_PATH_RE.test(`${u.pathname}${u.search}`.toLowerCase())) return { severity: 'high', reason: 'falso Nitro' };

  if (SHORTENERS.some(d => isUnder(host, d))) return { severity: 'low', reason: 'acortador de enlaces' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return { severity: 'low', reason: 'enlace a una IP' };
  if (host.includes('xn--')) return { severity: 'low', reason: 'dominio internacional (punycode)' };
  if (FREE_TLDS.includes(host.split('.').pop())) return { severity: 'low', reason: 'dominio gratuito sospechoso' };

  return null;
}

/** @returns {{severity:'low'|'high', reason:string}|null} */
function analyzeLinks(content) {
  const clean = stripInvisible(content || '');
  let worst = null;
  const bump = r => {
    if (r && (!worst || (r.severity === 'high' && worst.severity !== 'high'))) worst = r;
  };

  const urls = clean.match(URL_RE) || [];
  for (const raw of urls) bump(analyzeUrl(trimUrl(raw)));

  // [discord.com](https://evil.com) → texto y destino no coinciden
  for (const m of clean.matchAll(MASK_RE)) {
    const shown = (m[1].match(URL_RE) || [])[0];
    const target = parseUrl(trimUrl(m[2]));
    const shownUrl = shown ? parseUrl(trimUrl(shown)) : null;
    if (shownUrl && target && rootOf(cleanHost(shownUrl)) !== rootOf(cleanHost(target))) {
      bump({ severity: 'high', reason: 'enlace enmascarado engañoso' });
    }
    bump(analyzeUrl(trimUrl(m[2])));
  }

  if (urls.length && SCAM_PHRASE_RE.test(clean)) {
    bump({ severity: 'high', reason: 'frase típica de estafa + enlace' });
  }
  return worst;
}

function isSuspiciousLink(content) {
  return analyzeLinks(content) !== null;
}

// ---------- Invites de otros servidores (publicidad) ----------
const inviteCache = new Map(); // guildId -> { codes:Set|null, ts }
let warnedInviteFetch = false;

async function getOwnInviteCodes(guild) {
  const cached = inviteCache.get(guild.id);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.codes;

  let codes = null;
  try {
    const invites = await guild.invites.fetch();
    codes = new Set(invites.map(i => i.code.toLowerCase()));
    if (guild.vanityURLCode) codes.add(guild.vanityURLCode.toLowerCase());
  } catch {
    if (!warnedInviteFetch) {
      warnedInviteFetch = true;
      console.warn('[AutoMod] No puedo leer los invites del servidor (falta permiso "Gestionar servidor"). El bloqueo de invites ajenos queda desactivado.');
    }
  }
  inviteCache.set(guild.id, { codes, ts: Date.now() });
  return codes;
}

async function findForeignInvite(message) {
  if (!cfg.blockInvites) return null;
  const codes = [...stripInvisible(message.content).matchAll(INVITE_RE)].map(m => m[1].toLowerCase());
  if (!codes.length) return null;

  const own = await getOwnInviteCodes(message.guild);
  if (!own) return null; // sin permiso para verificar → no arriesgamos falsos positivos

  const allowed = new Set([...own, ...cfg.allowedInviteCodes.map(c => c.toLowerCase())]);
  return codes.find(c => !allowed.has(c)) || null;
}

// ============================================================
//  EDITOR DE PALABRAS (gg / ez / p2w / p2l)
// ============================================================
// Solo reemplaza la palabra detectada (no todo el mensaje) y respeta
// URLs, menciones, emojis custom y bloques `código`.
const phraseReplacements = [
  { pattern: /\b(?:gg+(?:\s?wp)?s?|good\s+games?)\b/gi, replacement: 'bien jugado!' },
  { pattern: /\b(?:ez+(?:pz)?|(?:too|so)\s+easy|easy\s+(?:win|game|clap))\b/gi, replacement: 'soy tóxico!' },
  { pattern: /\b(?:p2w|pay\s*(?:to|2)\s*win)\b/gi, replacement: 'no me quejo.' },
  { pattern: /\b(?:p2l|pay\s*(?:to|2)\s*lose)\b/gi, replacement: 'ah' }
];

const PROTECTED_RE = /(https?:\/\/\S+|<[^>\s]+>|`[^`]*`)/g; // un solo grupo de captura → índices impares = protegido

/** Devuelve el texto modificado o null si no hay nada que cambiar */
function applyPhraseEdits(content) {
  if (!content) return null;
  let changed = false;

  const out = content
    .split(PROTECTED_RE)
    .map((segment, i) => {
      if (i % 2 === 1) return segment;
      let s = segment;
      for (const rule of phraseReplacements) {
        s = s.replace(rule.pattern, () => {
          changed = true;
          return rule.replacement;
        });
      }
      return s;
    })
    .join('');

  return changed ? out : null;
}

function getPhraseReplacement(content) {
  return applyPhraseEdits(content);
}

function escapeMd(s) {
  return String(s).replace(/([\\*_~`|>])/g, '\\$1');
}

async function handlePhraseEdit(message) {
  const edited = applyPhraseEdits(message.content);
  if (!edited) return false;

  // Si borramos el original se perderían archivos/stickers → no tocamos esos mensajes
  if (message.attachments.size > 0 || (message.stickers && message.stickers.size > 0)) return false;

  try {
    await message.delete(); // si falla (sin permisos) no republicamos → evita duplicados
  } catch (e) {
    console.error('[AutoMod] No pude borrar el mensaje para editarlo:', e.message);
    return false;
  }

  const name = escapeMd(message.member?.displayName || message.author.username);
  const body = `✏️ **${name}** *(modificado)*: ${edited}`.slice(0, 2000);

  const payload = { content: body, allowedMentions: { parse: [] } };
  if (message.reference?.messageId) {
    payload.reply = { messageReference: message.reference.messageId, failIfNotExists: false };
  }

  await message.channel.send(payload).catch(e => console.error('[AutoMod] Error republicando mensaje:', e.message));
  return true;
}

// ============================================================
//  ANTI-SPAM (flood + mensajes duplicados) y STRIKES
// ============================================================
const history = new Map();    // guildId:userId → [{ id, channelId, ts, sig }]
const strikeMap = new Map();  // guildId:userId → [timestamps]

setInterval(() => {
  const now = Date.now();
  const maxAge = Math.max(spamCfg.timeWindow, cfg.duplicate.windowMs) * 2;
  for (const [k, list] of history) if (!list.length || now - list[list.length - 1].ts > maxAge) history.delete(k);
  for (const [k, list] of strikeMap) if (!list.length || now - list[list.length - 1] > cfg.strikes.windowMs) strikeMap.delete(k);
}, 60 * 1000).unref();

const keyOf = message => `${message.guild.id}:${message.author.id}`;

/** Registra el mensaje (síncrono) y devuelve la infracción si la hay */
function trackMessage(message) {
  const key = keyOf(message);
  const now = Date.now();
  const maxWindow = Math.max(spamCfg.timeWindow, cfg.duplicate.windowMs);
  const list = (history.get(key) || []).filter(e => now - e.ts <= maxWindow);

  const sig = (message.content || '').trim().toLowerCase().replace(/\s+/g, ' ');
  list.push({ id: message.id, channelId: message.channel.id, ts: now, sig });
  history.set(key, list);

  const recent = list.filter(e => now - e.ts <= spamCfg.timeWindow);
  if (recent.length >= spamCfg.maxMessages) {
    history.delete(key);
    return { type: 'flood', entries: recent };
  }

  if (sig) {
    const dups = list.filter(e => e.sig === sig && now - e.ts <= cfg.duplicate.windowMs);
    if (dups.length >= cfg.duplicate.count) {
      history.delete(key);
      return { type: 'duplicate', entries: dups };
    }
  }
  return null;
}

function addStrike(message) {
  const key = keyOf(message);
  const now = Date.now();
  const list = (strikeMap.get(key) || []).filter(t => now - t <= cfg.strikes.windowMs);
  list.push(now);
  strikeMap.set(key, list);
  if (list.length >= cfg.strikes.max) {
    strikeMap.delete(key);
    return true; // escalar a timeout
  }
  return false;
}

// ============================================================
//  ACCIONES
// ============================================================
function formatDuration(ms) {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`;
}

async function enforce(message, { warn, reason, timeoutMs = 0, strike = true, ttl = 6000 }) {
  await message.delete().catch(() => {});

  if (strike && addStrike(message)) timeoutMs = Math.max(timeoutMs, cfg.strikes.timeoutMs);

  let timedOut = false;
  if (timeoutMs > 0 && message.member?.moderatable) {
    timedOut = await message.member
      .timeout(timeoutMs, `AutoMod: ${reason}`)
      .then(() => true)
      .catch(() => false);
  }

  const text = timedOut ? `${warn}\n⏳ Silenciado por ${formatDuration(timeoutMs)}.` : warn;
  const sent = await message.channel
    .send({ content: `${message.author} ${text}`, allowedMentions: { users: [message.author.id] } })
    .catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => {}), ttl);
}

async function handleSpam(message, spam) {
  // Borra TODOS los mensajes del spam, no solo el último
  const byChannel = new Map();
  for (const e of spam.entries) {
    if (!byChannel.has(e.channelId)) byChannel.set(e.channelId, []);
    byChannel.get(e.channelId).push(e.id);
  }
  for (const [channelId, ids] of byChannel) {
    const ch = message.guild.channels.cache.get(channelId);
    if (ch && typeof ch.bulkDelete === 'function') await ch.bulkDelete(ids, true).catch(() => {});
  }
  await message.delete().catch(() => {});

  let timedOut = false;
  if (message.member?.moderatable) {
    timedOut = await message.member
      .timeout(spamCfg.muteTime, `AutoMod: ${spam.type === 'flood' ? 'flood' : 'mensajes repetidos'}`)
      .then(() => true)
      .catch(() => false);
  }

  const label = spam.type === 'flood' ? 'por enviar mensajes demasiado rápido' : 'por repetir el mismo mensaje';
  const sent = await message.channel
    .send({
      content: `🚫 ${message.author} ${timedOut ? `ha sido silenciado ${formatDuration(spamCfg.muteTime)}` : 'fue detectado'} ${label}.`,
      allowedMentions: { users: [message.author.id] }
    })
    .catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => {}), 8000);
}

// ============================================================
//  EXENCIONES
// ============================================================
function isExempt(member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  if (member.permissions.has('Administrator') || member.permissions.has('ManageMessages')) return true;
  const adminRole = member.guild.roles.cache.find(r => r.name === config.roles?.admin);
  return Boolean(adminRole && member.roles.cache.has(adminRole.id));
}

// ============================================================
//  PIPELINE PRINCIPAL
// ============================================================
/**
 * @param {import('discord.js').Message} message
 * @param {{edited?: boolean}} opts  edited=true → mensaje editado (sin spam ni editor de palabras)
 * @returns {Promise<boolean>} true si el mensaje fue bloqueado/modificado
 */
async function handleMessage(message, { edited = false } = {}) {
  if (!message.guild || !message.author || message.author.bot) return false;
  if (isExempt(message.member)) return false;

  // 0. Anti-spam primero y de forma síncrona: cuenta TODOS los mensajes
  //    (antes, los "gg"/"ez" y los mensajes filtrados escapaban del contador)
  if (!edited) {
    const spam = trackMessage(message);
    if (spam) {
      await handleSpam(message, spam);
      return true;
    }
  }

  const content = message.content || '';
  if (!content) return false;

  // 1. Palabras prohibidas (odio / racismo)
  const bad = findBadWord(content);
  if (bad) {
    await enforce(message, {
      warn: 'ese tipo de lenguaje no está permitido aquí.',
      reason: 'lenguaje no permitido',
      ttl: 5000
    });
    return true;
  }

  // 2. Phishing / estafas
  const link = analyzeLinks(content);
  if (link) {
    await enforce(message, {
      warn: link.severity === 'high'
        ? '🔗 se detectó un enlace **peligroso** y fue eliminado. Si no fuiste tú, cambia tu contraseña.'
        : '🔗 se detectó un enlace sospechoso y fue eliminado.',
      reason: `enlace sospechoso (${link.reason})`,
      timeoutMs: link.severity === 'high' ? cfg.phishingTimeoutMs : 0,
      ttl: 8000
    });
    return true;
  }

  // 3. Publicidad (invites de otros servidores)
  const invite = await findForeignInvite(message);
  if (invite) {
    await enforce(message, {
      warn: '📢 no se permite publicidad ni invites de otros servidores.',
      reason: 'invite de otro servidor',
      ttl: 6000
    });
    return true;
  }

  // 4. Menciones masivas
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= cfg.maxMentions) {
    await enforce(message, {
      warn: '📣 demasiadas menciones en un solo mensaje.',
      reason: 'menciones masivas',
      ttl: 6000
    });
    return true;
  }

  // 5. Editor de palabras (solo mensajes nuevos, y siempre DESPUÉS de los filtros)
  if (!edited && (await handlePhraseEdit(message))) return true;

  return false;
}

module.exports = {
  handleMessage,
  isBadWord,
  isSuspiciousLink,
  getPhraseReplacement,
  // para tests
  _internals: { findBadWord, analyzeLinks, analyzeUrl, applyPhraseEdits, baseNormalize, trackMessage }
};
