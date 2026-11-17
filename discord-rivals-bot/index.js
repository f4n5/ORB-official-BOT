require('dotenv').config();
const express = require('express');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Collection,
  Partials
} = require('discord.js');
const fs = require('fs');
const fetch = require('node-fetch');
const config = require('./config');
const { ensureRole } = require('./utils/roles');
const { signToken, verifyToken, createCaptcha, checkCaptcha } = require('./utils/tokens');
const { notifyTryout } = require('./utils/tryouts');

// ===================== DISCORD CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  // Partials.Message → permite revisar mensajes editados que no estaban en caché
  partials: [Partials.Channel, Partials.Message]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// ===================== EXPRESS =====================
const app = express();
app.set('trust proxy', 1); // Render está detrás de un proxy
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const IS_HTTPS = config.publicUrl.startsWith('https://');
const SESSION_TTL = 24 * 60 * 60 * 1000;


// ---------- Llamadas a la API de Discord ----------
// Discord exige un User-Agent con este formato; sin él Cloudflare es mucho más agresivo con las IPs de Render.
const DISCORD_UA = `DiscordBot (${config.publicUrl}, 1.0)`;

async function discordFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'User-Agent': DISCORD_UA, Accept: 'application/json', ...(options.headers || {}) }
  });

  if (!res.ok) {
    const text = await res.text();
    // Cloudflare 1015 / 429: la IP del servidor está limitada temporalmente
    if (res.status === 429 || res.status === 403 && /cloudflare|error\s*1015/i.test(text)) {
      const err = new Error('Discord está limitando temporalmente al servidor');
      err.code = 'RATE_LIMITED';
      throw err;
    }
    // Nunca mostramos el cuerpo crudo (puede ser una página HTML entera)
    console.error(`[Discord API] ${res.status} en ${url}: ${text.slice(0, 300)}`);
    const err = new Error(`Discord respondió con error ${res.status}`);
    err.code = 'DISCORD_API';
    throw err;
  }
  return res;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      try { list[key] = decodeURIComponent(parts.join('=')); } catch { list[key] = parts.join('='); }
    });
  }
  return list;
}

// ---------- Sesión web SIN estado (cookie firmada) → sobrevive a reinicios de Render ----------
function createWebSession(user) {
  return signToken('session', { id: user.id, u: user.username, a: user.avatar || null }, SESSION_TTL);
}

function getWebSession(req) {
  const result = verifyToken(parseCookies(req).session, 'session');
  if (!result.ok) return null;
  const p = result.payload;
  return { discordId: p.id, username: p.u, avatar: p.a };
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}${IS_HTTPS ? '; Secure' : ''}`);
}

function avatarUrl(session) {
  return session.avatar
    ? `https://cdn.discordapp.com/avatars/${session.discordId}/${session.avatar}.png?size=64`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
}

// ---------- Plantilla simple para páginas de estado ----------
function statusPage(title, bodyHtml, { color = '#5865F2' } = {}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    body { background: #1e1f22; color: #dbdee1; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #2b2d31; padding: 2rem; border-radius: 12px; max-width: 460px; width: 92%; box-shadow: 0 12px 40px rgba(0,0,0,.45); }
    h1, h2 { margin-top: 0; color: ${color}; }
    p, li { color: #b5bac1; line-height: 1.55; }
    a { color: #5865F2; }
    .btn { display: inline-block; padding: .8rem 1.3rem; border-radius: 8px; background: #5865F2; color: #fff; font-weight: 600; text-decoration: none; margin-top: .8rem; }
    .btn:hover { background: #4752c4; }
  </style>
</head>
<body><div class="card">${bodyHtml}</div></body>
</html>`;
}

app.get('/ping', (req, res) => res.status(200).send('pong'));

// ========== HOME ==========
app.get('/', (req, res) => {
  const session = getWebSession(req);
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rivals Bot</title>
  <style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    body { background: #1e1f22; color: #dbdee1; margin: 0; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
    .card { background: #2b2d31; padding: 2.5rem; border-radius: 16px; max-width: 480px; width: 92%; box-shadow: 0 12px 40px rgba(0,0,0,.45); }
    h1 { margin: 0 0 0.5rem; color: #fff; font-size: 1.6rem; }
    p { color: #b5bac1; line-height: 1.5; }
    .btn { display: inline-block; padding: 0.85rem 1.4rem; border-radius: 8px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; font-size: 1rem; margin-top: 1rem; }
    .btn-discord { background: #5865F2; color: white; }
    .btn-discord:hover { background: #4752c4; }
    .btn-green { background: #57F287; color: #111; }
    .btn-green:hover { background: #3ba55d; color: white; }
    .user { display: flex; align-items: center; gap: 12px; margin: 1.2rem 0; }
    .user img { width: 48px; height: 48px; border-radius: 50%; }
    .status { font-size: 0.85rem; color: #949ba4; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🎮 Rivals Bot</h1>
    <p>Panel web del bot (pruebas y estado).</p>
    ${session ? `
      <div class="user">
        <img src="${esc(avatarUrl(session))}" alt="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div>
          <strong>${esc(session.username)}</strong><br>
          <small style="color:#949ba4">Sesión iniciada</small>
        </div>
      </div>
      <a class="btn btn-green" href="/dashboard">Ir al Dashboard →</a>
      <br><br>
      <a href="/logout" style="color:#ed4245;font-size:0.9rem;">Cerrar sesión</a>
    ` : `
      <p>Para usar la sección de <strong>pruebas</strong> inicia sesión con Discord.</p>
      <a class="btn btn-discord" href="/auth/discord">Iniciar sesión con Discord</a>
    `}
    <p class="status">Bot: ${client.isReady() ? '✅ Online' : '⏳ Conectando...'} · <a href="/ping" style="color:#5865F2">/ping</a></p>
  </div>
</body>
</html>
  `);
});

// ========== DISCORD OAUTH ==========
// ?intent=tryout  → al volver de Discord se notifica automáticamente a Owner/Admin
app.get('/auth/discord', (req, res) => {
  const intent = req.query.intent === 'tryout' ? 'tryout' : null;
  // "state" firmado: protege el login (CSRF) y recuerda la intención sin guardar nada en memoria
  const state = signToken('oauth', { intent }, 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.publicUrl}/auth/discord/callback`,
    response_type: 'code',
    scope: 'identify',
    state
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code, error, state } = req.query;
  if (error || !code) {
    return res.status(400).send(statusPage('Error de login',
      `<h2>Error de login</h2><p>${esc(error || 'Discord no devolvió ningún código')}</p><a class="btn" href="/">Volver</a>`, { color: '#ed4245' }));
  }

  let intent = null;
  if (state) {
    const st = verifyToken(String(state), 'oauth');
    if (!st.ok) {
      return res.status(400).send(statusPage('Login expirado',
        `<h2>El inicio de sesión expiró</h2><p>Vuelve a Discord y pulsa el botón otra vez.</p>`, { color: '#ed4245' }));
    }
    intent = st.payload.intent;
  }

  try {
    const tokenRes = await discordFetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${config.publicUrl}/auth/discord/callback`
      })
    });

    const tokens = await tokenRes.json();

    const userRes = await discordFetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();

    setSessionCookie(res, createWebSession(user));

    if (intent !== 'tryout') return res.redirect('/dashboard');

    // ---- Botón de /tryout-setup: notificar a Owner/Admin y al usuario ----
    const result = await notifyTryout(client, { discordId: user.id, username: user.username });

    if (!result.ok) {
      const warn = result.code === 'cooldown';
      return res.status(warn ? 200 : 400).send(statusPage('Tryout',
        `<h2>${warn ? '⏳ Un momento' : '❌ No se pudo enviar'}</h2><p>${esc(result.error)}</p>
         <a class="btn" href="/dashboard">Ir al Dashboard</a>`, { color: warn ? '#FEE75C' : '#ed4245' }));
    }

    return res.send(statusPage('Tryout solicitado',
      `<h2>✅ ¡Tryout solicitado!</h2>
       <p>Hola <strong>${esc(user.username)}</strong>, ya notificamos al <strong>Owner</strong> y a los <strong>Admins</strong>.</p>
       <p><strong>Lo que debes hacer ahora:</strong></p>
       <ul>
         <li>Completar las <strong>3 pruebas</strong>: <strong>DL</strong>, <strong>SDL</strong> y <strong>CL</strong>.</li>
         <li>Estar pendiente del canal de tryouts: un Admin/Owner te contactará.</li>
         <li>No mencionar a los admins: ya fueron avisados.</li>
       </ul>
       <p>${result.dmSent ? '📩 También te enviamos un mensaje directo con estas instrucciones.' : ''}</p>
       <a class="btn" href="${esc(result.messageUrl)}">Volver a Discord</a>`, { color: '#57F287' }));
  } catch (err) {
    console.error('Discord OAuth error:', err.message);
    if (err.code === 'RATE_LIMITED') {
      const retryUrl = `/auth/discord${intent === 'tryout' ? '?intent=tryout' : ''}`;
      return res.status(503).send(statusPage('Intenta de nuevo',
        `<h2>⏳ Discord está ocupado</h2>
         <p>Discord limitó temporalmente al servidor del bot. No es culpa tuya.</p>
         <p>Espera <strong>1–2 minutos</strong> y vuelve a intentarlo. <strong>No pulses el botón varias veces seguidas</strong>: eso alarga el bloqueo.</p>
         <a class="btn" href="${retryUrl}">Reintentar</a>`, { color: '#FEE75C' }));
    }
    res.status(500).send(statusPage('Error',
      `<h2>Error al iniciar sesión</h2><p>${esc(err.message)}</p><a class="btn" href="/">Volver</a>`, { color: '#ed4245' }));
  }
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `session=; Path=/; Max-Age=0${IS_HTTPS ? '; Secure' : ''}`);
  res.redirect('/');
});

// ========== DASHBOARD + HACER PRUEBAS ==========
app.get('/dashboard', (req, res) => {
  const session = getWebSession(req);
  if (!session) return res.redirect('/');

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - Rivals</title>
  <style>
    * { box-sizing: border-box; font-family: system-ui, sans-serif; }
    body { background: #1e1f22; color: #dbdee1; margin: 0; min-height: 100vh; padding: 2rem 1rem; }
    .container { max-width: 560px; margin: 0 auto; }
    .card { background: #2b2d31; padding: 2rem; border-radius: 16px; margin-bottom: 1.5rem; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
    h1, h2 { color: #fff; margin-top: 0; }
    p { color: #b5bac1; line-height: 1.55; }
    .user { display: flex; align-items: center; gap: 12px; margin-bottom: 1.5rem; }
    .user img { width: 52px; height: 52px; border-radius: 50%; }
    .btn { display: inline-block; padding: 0.9rem 1.6rem; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; font-size: 1rem; }
    .btn-pruebas { background: #FEE75C; color: #111; width: 100%; }
    .btn-pruebas:hover { background: #f0d84a; }
    .btn-pruebas:disabled { opacity: 0.6; cursor: not-allowed; }
    .tests { background: #1e1f22; padding: 1rem 1.2rem; border-radius: 8px; margin: 1rem 0; }
    .tests li { margin: 0.4rem 0; }
    #result { margin-top: 1rem; padding: 0.9rem; border-radius: 8px; display: none; }
    .success { background: #1a3a2a; color: #57F287; }
    .error { background: #3a1a1a; color: #ed4245; }
    a { color: #5865F2; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="user">
        <img src="${esc(avatarUrl(session))}" alt="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
        <div>
          <strong>${esc(session.username)}</strong><br>
          <small style="color:#949ba4">ID: ${esc(session.discordId)}</small>
        </div>
      </div>
      <p><a href="/logout">Cerrar sesión</a></p>
    </div>

    <div class="card">
      <h2>🧪 Hacer pruebas</h2>
      <p>Al pulsar el botón se enviará un aviso al canal de pruebas indicando que debes completar:</p>
      <ul class="tests">
        <li><strong>DL</strong></li>
        <li><strong>SDL</strong></li>
        <li><strong>CL</strong></li>
      </ul>
      <p>Se mencionará a los administradores/owner y a ti.</p>
      <button class="btn btn-pruebas" id="btnPruebas" onclick="solicitarPruebas()">Hacer pruebas</button>
      <div id="result"></div>
    </div>
  </div>

  <script>
    async function solicitarPruebas() {
      const btn = document.getElementById('btnPruebas');
      const result = document.getElementById('result');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      try {
        const res = await fetch('/api/solicitar-pruebas', { method: 'POST', credentials: 'same-origin' });
        const data = await res.json();
        result.style.display = 'block';
        if (data.ok) {
          result.className = 'success';
          result.textContent = '✅ ' + data.message;
        } else {
          result.className = 'error';
          result.textContent = '❌ ' + (data.error || 'Error desconocido');
        }
      } catch (e) {
        result.style.display = 'block';
        result.className = 'error';
        result.textContent = '❌ Error de conexión';
      }
      btn.disabled = false;
      btn.textContent = 'Hacer pruebas';
    }
  </script>
</body>
</html>
  `);
});

app.post('/api/solicitar-pruebas', async (req, res) => {
  const session = getWebSession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'No has iniciado sesión' });

  try {
    const result = await notifyTryout(client, { discordId: session.discordId, username: session.username });
    if (!result.ok) return res.status(result.code === 'cooldown' ? 429 : 400).json({ ok: false, error: result.error });
    res.json({ ok: true, message: 'Aviso enviado. Un Admin/Owner te contactará en el canal de tryouts.' });
  } catch (err) {
    console.error('Error enviando pruebas:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========== CAPTCHA (verificación Discord) ==========
function tokenErrorPage(reason) {
  const expired = reason === 'expired';
  return statusPage(expired ? 'Enlace expirado' : 'Enlace inválido',
    `<h2>${expired ? '⏳ El enlace expiró' : '❌ Enlace inválido'}</h2>
     <p>${expired
       ? 'Los enlaces duran 15 minutos.'
       : 'El enlace está incompleto o fue modificado. Abre el enlace <strong>completo</strong> tal como lo envió el bot.'}</p>
     <p>Vuelve a Discord y pulsa el botón <strong>Verificar</strong> para obtener uno nuevo.</p>`,
    { color: '#ed4245' });
}

app.get('/captcha', (req, res) => {
  const token = String(req.query.token || '');
  const v = verifyToken(token, 'verify');
  if (!v.ok) return res.status(400).send(tokenErrorPage(v.reason));

  const { a, b, challenge } = createCaptcha(token);

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CAPTCHA - Verificación</title>
  <style>
    * { box-sizing: border-box; font-family: system-ui, sans-serif; }
    body { background: #1e1f22; color: #dbdee1; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #2b2d31; padding: 2rem; border-radius: 12px; max-width: 400px; width: 90%; }
    h1 { margin-top: 0; color: #fff; font-size: 1.4rem; }
    .question { font-size: 1.8rem; font-weight: 700; margin: 1.5rem 0; text-align: center; color: #57F287; }
    input { width: 100%; padding: 0.75rem; border: none; border-radius: 6px; background: #1e1f22; color: #fff; font-size: 1.1rem; margin-bottom: 1rem; }
    button { width: 100%; padding: 0.8rem; border: none; border-radius: 6px; background: #5865F2; color: white; font-weight: 600; cursor: pointer; }
    button:hover { background: #4752c4; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🔐 CAPTCHA de Verificación</h1>
    <p>Resuelve esta suma para confirmar que no eres un bot:</p>
    <div class="question">${a} + ${b} = ?</div>
    <form method="POST" action="/captcha/submit">
      <input type="hidden" name="token" value="${esc(token)}">
      <input type="hidden" name="challenge" value="${esc(challenge)}">
      <input type="number" name="answer" placeholder="Tu respuesta" required autofocus>
      <button type="submit">Verificar</button>
    </form>
  </div>
</body>
</html>
  `);
});

app.post('/captcha/submit', async (req, res) => {
  const { token, challenge, answer } = req.body || {};

  const v = verifyToken(String(token || ''), 'verify');
  if (!v.ok) return res.status(400).send(tokenErrorPage(v.reason));

  const check = checkCaptcha(String(token), challenge, answer);
  if (!check.ok) {
    const msg = check.reason === 'wrong' ? '❌ Respuesta incorrecta' : '⏳ El CAPTCHA expiró';
    return res.send(statusPage('CAPTCHA',
      `<h2>${msg}</h2><p><a class="btn" href="/captcha?token=${encodeURIComponent(token)}">Intentar de nuevo</a></p>`, { color: '#ed4245' }));
  }

  try {
    const guild = await client.guilds.fetch(v.payload.g);
    const member = await guild.members.fetch(v.payload.d);
    const memberRole = await ensureRole(guild, config.roles.member, { color: 0x57F287, hoist: true });

    if (!member.roles.cache.has(memberRole.id)) {
      await member.roles.add(memberRole, 'Verificado por CAPTCHA');
    }

    res.send(statusPage('Verificado',
      `<div style="text-align:center">
        <h1 style="color:#57F287">✅ ¡Verificación exitosa!</h1>
        <p>Se te ha otorgado el rol <strong>${esc(config.roles.member)}</strong>.</p>
        <p>Ya puedes ver todos los canales del servidor.</p>
        <p style="margin-top:1.5rem;color:#949ba4">Puedes cerrar esta ventana y volver a Discord.</p>
      </div>`, { color: '#57F287' }));
  } catch (err) {
    console.error('Error asignando roles:', err);
    const hint = err.code === 50013
      ? 'El rol del bot debe estar <strong>por encima</strong> del rol Miembro en Ajustes del servidor → Roles.'
      : esc(err.message);
    res.status(500).send(statusPage('Error',
      `<h2>Error al asignar el rol</h2><p>${hint}</p><p>Contacta a un administrador.</p>`, { color: '#ed4245' }));
  }
});

// ===================== START =====================
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web en puerto ${PORT}`);
  console.log(`   Keep-alive: ${config.publicUrl}/ping`);
  console.log(`   Dashboard:  ${config.publicUrl}/`);
});

// Keep-alive: Render (plan gratis) duerme el servicio tras ~15 min sin visitas.
// El README lo prometía pero no existía en el código.
if (/^https:\/\//.test(config.publicUrl)) {
  setInterval(() => {
    fetch(`${config.publicUrl}/ping`).catch(() => {});
  }, 4 * 60 * 1000).unref();
}

client.login(config.token).catch(err => {
  console.error('Error al iniciar el bot:', err);
  process.exit(1);
});

module.exports = { client, app };
