require('dotenv').config();
const express = require('express');
const path = require('path');
const { signToken, verifyToken, createCaptcha, checkCaptcha } = require('./tokens');
const { createLinkCode, consumeLinkCode, getLinkedUser } = require('./appLinks');
const {
  isVerifiedMember,
  assignMemberRole,
  assignAppLinkedRole
} = require('./discordRest');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const APP_API_KEY = process.env.CRYPT3D_APP_API_KEY || null;
const BOT_KEY = process.env.BOT_INTERNAL_KEY || null;

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function page(title, body, color = '#7C3AED') {
  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box;font-family:system-ui,sans-serif}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0f12;color:#e5e7eb}
.card{background:#1c1c22;padding:2rem;border-radius:14px;max-width:420px;width:92%;box-shadow:0 12px 40px rgba(0,0,0,.45)}
h1{margin:0 0 .5rem;color:${color};font-size:1.35rem}
p,li{color:#9ca3af;line-height:1.5}
input{width:100%;padding:.75rem;border-radius:8px;border:1px solid #374151;background:#111;color:#fff;margin:.5rem 0 1rem}
button,.btn{display:inline-block;padding:.75rem 1.2rem;border-radius:8px;border:0;background:#7C3AED;color:#fff;font-weight:600;cursor:pointer;text-decoration:none}
button:hover,.btn:hover{background:#6d28d9}
</style></head><body><div class="card">${body}</div></body></html>`;
}

function checkAppKey(req) {
  if (!APP_API_KEY) return true;
  return (req.headers['x-api-key'] || req.query.key) === APP_API_KEY;
}

function checkBotKey(req) {
  if (!BOT_KEY) return true; // open if not set (not recommended)
  return (req.headers['x-bot-key'] || req.query.key) === BOT_KEY;
}

// ---------- health ----------
app.get('/ping', (req, res) => res.status(200).send('pong'));
app.get('/health', (req, res) =>
  res.json({ ok: true, service: 'crypt3d-web', uptime: Math.round(process.uptime()) })
);

app.get('/', (req, res) => {
  res.send(page('Crypt3d Web', `
    <h1>Crypt3d Web</h1>
    <p>Render host for CAPTCHA + desktop app API.</p>
    <p>Discord gateway bot runs on your other host.</p>
    <p style="margin-top:1.2rem"><a class="btn" href="/ping">/ping</a></p>
  `));
});

// ---------- CAPTCHA web (bot sends user here with signed token) ----------
// Token type "verify": { d: discordId, g: guildId }
app.get('/captcha', (req, res) => {
  const token = req.query.token;
  const v = verifyToken(token, 'verify');
  if (!v.ok) {
    return res.status(400).send(page('Error', `<h1>Token inválido o expirado</h1><p>Pide un nuevo enlace en Discord.</p>`, '#ef4444'));
  }
  const { a, b, challenge } = createCaptcha(token);
  res.send(page('Verificación', `
    <h1>Verificación</h1>
    <p>Resuelve la suma para obtener el rol <strong>Miembro</strong>.</p>
    <form method="POST" action="/captcha">
      <input type="hidden" name="token" value="${esc(token)}"/>
      <input type="hidden" name="challenge" value="${esc(challenge)}"/>
      <label>¿Cuánto es <strong>${a} + ${b}</strong>?</label>
      <input name="answer" inputmode="numeric" autocomplete="off" required autofocus/>
      <button type="submit">Verificar</button>
    </form>
  `));
});

app.post('/captcha', async (req, res) => {
  const { token, challenge, answer } = req.body || {};
  const v = verifyToken(token, 'verify');
  if (!v.ok) {
    return res.status(400).send(page('Error', `<h1>Token inválido o expirado</h1>`, '#ef4444'));
  }
  const cap = checkCaptcha(token, challenge, answer);
  if (!cap.ok) {
    return res.status(400).send(page('Incorrecto', `
      <h1>Respuesta incorrecta</h1>
      <p><a class="btn" href="/captcha?token=${encodeURIComponent(token)}">Reintentar</a></p>
    `, '#ef4444'));
  }
  try {
    await assignMemberRole(v.payload.d);
    res.send(page('OK', `
      <h1 style="color:#10b981">¡Verificado!</h1>
      <p>Ya tienes el rol Miembro. Vuelve a Discord y usa <code>/app-link</code> para Crypt3d.</p>
    `, '#10b981'));
  } catch (e) {
    console.error('assignMemberRole', e.message);
    res.status(500).send(page('Error', `
      <h1>No se pudo asignar el rol</h1>
      <p>El bot necesita permiso Manage Roles y su rol debe estar por encima de Miembro.</p>
      <p style="font-size:12px">${esc(e.message)}</p>
    `, '#ef4444'));
  }
});

// Bot creates a signed captcha link for a user (optional helper)
app.post('/api/internal/verify-link', (req, res) => {
  if (!checkBotKey(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const discordId = String(req.body?.discordId || '');
  const guildId = String(req.body?.guildId || process.env.GUILD_ID || '');
  if (!discordId) return res.status(400).json({ ok: false, error: 'missing_discordId' });
  const token = signToken('verify', { d: discordId, g: guildId }, 15 * 60 * 1000);
  const url = `${PUBLIC_URL}/captcha?token=${token}`;
  res.json({ ok: true, url, token });
});

// ---------- App-link: bot creates code ----------
app.post('/api/internal/create-link', (req, res) => {
  if (!checkBotKey(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const discordId = String(req.body?.discordId || '');
  const username = String(req.body?.username || 'User');
  if (!discordId) return res.status(400).json({ ok: false, error: 'missing_discordId' });
  const code = createLinkCode(discordId, username);
  res.json({ ok: true, code, expiresInMinutes: 10 });
});

// ---------- Desktop app ----------
app.post('/api/app/link', async (req, res) => {
  if (!checkAppKey(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const result = consumeLinkCode(req.body?.code);
  if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });

  let verified = false;
  try {
    verified = await isVerifiedMember(result.discordId);
    if (verified) await assignAppLinkedRole(result.discordId);
  } catch (e) {
    console.error('link verify', e.message);
    verified = true; // if REST fails, trust code was issued after member check on bot
  }

  res.json({
    ok: true,
    verified,
    discordId: result.discordId,
    username: result.username,
    message: verified
      ? `Bienvenido @${result.username}`
      : 'Código válido, pero aún no tienes rol Miembro en Discord.'
  });
});

app.get('/api/app/status', async (req, res) => {
  if (!checkAppKey(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const discordId = String(req.query.discordId || '');
  if (!discordId) return res.status(400).json({ ok: false, error: 'missing_discordId' });

  const linked = getLinkedUser(discordId);
  let verified = false;
  let username = linked?.username || null;
  try {
    verified = await isVerifiedMember(discordId);
  } catch (e) {
    verified = !!linked;
  }

  res.json({
    ok: true,
    linked: !!linked,
    verified,
    discordId,
    username,
    welcome: verified && username ? `Bienvenido @${username}` : null
  });
});

app.listen(PORT, () => {
  console.log(`Crypt3d web on :${PORT}`);
  console.log(`PUBLIC_URL=${PUBLIC_URL}`);
  console.log(`Ping: ${PUBLIC_URL}/ping`);
});
