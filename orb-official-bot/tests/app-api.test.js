process.env.GUILD_ID = 'G1';
process.env.SESSION_SECRET = 'test-secret';
process.env.PUBLIC_URL = 'https://orb.test';
process.env.SHOW_CHANNEL_ID = 'C1';
process.env.GUILD_INVITE_URL = 'https://discord.gg/abc';
const assert = require('assert');
const express = require('express');
const http = require('http');
const config = require('../config');

// ---- Discord falso ----
const roles = [{ id: 'R_MEMBER', name: config.roles.member }, { id: 'R_BAN', name: config.roles.banned }];
const mkMember = (id, name, roleIds) => ({
  id, displayName: name, user: { id, username: name },
  roles: { cache: { has: r => roleIds.includes(r) } },
  displayAvatarURL: () => `https://cdn/x/${id}.png`
});
const members = {
  verified: mkMember('U_OK', 'Gabri', ['R_MEMBER']),
  unverified: mkMember('U_NV', 'Nuevo', []),
  banned: mkMember('U_BAN', 'Malo', ['R_MEMBER', 'R_BAN']),
  evil: mkMember('U_EVIL', '@everyone **hola** <@123>\nlinea2', ['R_MEMBER']),
};
const byId = Object.fromEntries(Object.values(members).map(m => [m.id, m]));
let memberFetchError = null;
const guild = {
  roles: { cache: { find: fn => roles.find(fn) } },
  members: {
    cache: new Map(),
    fetch: async id => {
      if (memberFetchError) throw memberFetchError;
      if (!byId[id]) { const e = new Error('Unknown Member'); e.code = 10007; throw e; }
      return byId[id];
    }
  }
};
const sent = []; const deleted = [];
const channel = {
  id: 'C1', isTextBased: () => true,
  messages: { fetch: async id => { const m = sent.find(x => x.id === id && !deleted.includes(id)); if (!m) throw new Error('nope');
      return { edit: async p => { m.payload = p; }, delete: async () => { deleted.push(id); } }; } },
  send: async payload => { const m = { id: 'M' + (sent.length + 1), payload }; sent.push(m); return m; }
};
const client = {
  guilds: { cache: { get: id => id === 'G1' ? guild : undefined, first: () => guild }, fetch: async () => guild },
  channels: { cache: { get: id => id === 'C1' ? channel : undefined }, fetch: async () => channel }
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statusPage = (t, b) => `<html><title>${t}</title>${b}</html>`;

const api = require('../routes/app')({ client, statusPage, esc });
const app = express(); app.use(express.json()); app.set('trust proxy', 1); app.use(api.router);

function req(port, method, path, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ port, method, path, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, res => {
      let t = ''; res.on('data', c => t += c); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch {} resolve({ status: res.statusCode, json: j, text: t, headers: res.headers }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

(async () => {
  const server = app.listen(0); const port = server.address().port;
  let n = 0; const ok = (name) => console.log(`  ✔ ${++n}. ${name}`);

  // config pública
  let r = await req(port, 'GET', '/api/app/config');
  assert.equal(r.json.inviteUrl, 'https://discord.gg/abc'); assert.equal(r.json.showEnabled, true); ok('config pública');

  // login: flujo feliz
  r = await req(port, 'POST', '/api/app/login/start');
  assert(r.json.ok && r.json.loginUrl.startsWith('https://orb.test/app/login?code=')); const { code, secret } = r.json; ok('login/start devuelve code+secret+loginUrl');
  r = await req(port, 'GET', `/api/app/login/poll?code=${code}&secret=${secret}`); assert.equal(r.json.status, 'pending'); ok('poll → pending');
  r = await req(port, 'GET', `/api/app/login/poll?code=${code}&secret=MAL`); assert.equal(r.status, 404); ok('poll con secret incorrecto → 404 (nadie puede robar la sesión)');
  r = await req(port, 'GET', `/app/login?code=${code}`);
  assert.equal(r.status, 302); const loc = new URL(r.headers.location); assert.equal(loc.host, 'discord.com'); assert.equal(loc.searchParams.get('scope'), 'identify');
  const { verifyToken } = require('../utils/tokens'); const st = verifyToken(loc.searchParams.get('state'), 'oauth'); assert(st.ok && st.payload.intent === 'app' && st.payload.lc === code); ok('/app/login redirige a Discord con state firmado (intent=app)');

  let fin = await api.finishLogin(code, { id: 'U_OK', username: 'gabri' });
  assert.equal(fin.status, 200); assert(fin.html.includes('Gabri')); ok('finishLogin: verificado → página de éxito');
  r = await req(port, 'GET', `/api/app/login/poll?code=${code}&secret=${secret}`);
  assert.equal(r.json.status, 'approved'); assert(r.json.token); assert.equal(r.json.user.name, 'Gabri'); const token = r.json.token; ok('poll → approved con token y usuario');
  r = await req(port, 'GET', `/api/app/login/poll?code=${code}&secret=${secret}`); assert.equal(r.status, 404); ok('el resultado se entrega una sola vez');

  // login: denegados
  for (const [uid, reason] of [['U_NV', 'not_verified'], ['U_BAN', 'banned'], ['U_NADIE', 'not_in_server']]) {
    r = await req(port, 'POST', '/api/app/login/start'); const c2 = r.json;
    fin = await api.finishLogin(c2.code, { id: uid }); assert.equal(fin.status, 403);
    if (reason === 'not_in_server') assert(fin.html.includes('https://discord.gg/abc'));
    r = await req(port, 'GET', `/api/app/login/poll?code=${c2.code}&secret=${c2.secret}`); assert.equal(r.json.status, 'denied'); assert.equal(r.json.reason, reason);
    ok(`login denegado: ${reason}`);
  }
  fin = await api.finishLogin('codigo-inexistente', { id: 'U_OK' }); assert.equal(fin.status, 400); ok('finishLogin con código inexistente → 400');

  // /me
  r = await req(port, 'GET', '/api/app/me'); assert.equal(r.status, 401); ok('/me sin token → 401');
  r = await req(port, 'GET', '/api/app/me', { token: token + 'x' }); assert.equal(r.status, 401); ok('/me con token manipulado → 401');
  r = await req(port, 'GET', '/api/app/me', { token }); assert(r.json.ok && r.json.user.name === 'Gabri' && r.json.token); ok('/me válido → usuario + token renovado');
  const { signToken } = require('../utils/tokens');
  const tokNV = signToken('app', { id: 'U_NV', u: 'x' }, 1e6);
  r = await req(port, 'GET', '/api/app/me', { token: tokNV }); assert.equal(r.status, 403); assert.equal(r.json.reason, 'not_verified'); ok('/me de alguien que perdió la verificación → 403');
  const tokWeb = signToken('session', { id: 'U_OK', u: 'x' }, 1e6);
  r = await req(port, 'GET', '/api/app/me', { token: tokWeb }); assert.equal(r.status, 401); ok('el token de la web NO sirve como token de la app');
  const tokExp = signToken('app', { id: 'U_OK', u: 'x' }, -1000);
  r = await req(port, 'GET', '/api/app/me', { token: tokExp }); assert.equal(r.status, 401); assert.equal(r.json.reason, 'expired'); ok('token caducado → 401 expired');
  // fallo de Discord ≠ "no estás en el servidor"
  memberFetchError = Object.assign(new Error('rate'), { code: 429 });
  const tokOther = signToken('app', { id: 'U_OTHER', u: 'x' }, 1e6);
  r = await req(port, 'GET', '/api/app/me', { token: tokOther }); assert.equal(r.status, 503); assert.equal(r.json.reason, 'server_error'); memberFetchError = null; ok('error de Discord → 503 server_error (no confunde con not_in_server)');

  // Show in Discord
  r = await req(port, 'POST', '/api/app/show', { body: { action: 'start' } }); assert.equal(r.status, 401); ok('show sin token → 401');
  r = await req(port, 'POST', '/api/app/show', { token, body: { action: 'start', showName: true } }); assert(r.json.ok); assert.equal(sent.length, 1);
  assert(sent[0].payload.embeds[0].data.title.includes('Gabri')); assert.deepEqual(sent[0].payload.allowedMentions, { parse: [] }); ok('show start publica embed sin menciones');
  r = await req(port, 'POST', '/api/app/show', { token, body: { action: 'start' } }); assert.equal(r.status, 429); ok('show start repetido → 429 (límite por usuario)');
  r = await req(port, 'POST', '/api/app/show', { token, body: { action: 'stop' } }); assert(r.json.ok); assert.deepEqual(deleted, ['M1']); ok('show stop borra el mensaje');
  const tokEvil = signToken('app', { id: 'U_EVIL', u: 'x' }, 1e6);
  r = await req(port, 'POST', '/api/app/show', { token: tokEvil, body: { action: 'start' } }); assert(r.json.ok);
  const title = sent[1].payload.embeds[0].data.title; assert(!/[<>@*\n]/.test(title.replace('🟣', ''))); ok('nombre con @everyone/markdown/saltos queda sanitizado: «' + title + '»');
  r = await req(port, 'POST', '/api/app/show', { token: tokNV, body: { action: 'start' } }); assert.equal(r.status, 403); ok('show start de no verificado → 403');
  r = await req(port, 'POST', '/api/app/show', { token, body: { action: 'hack' } }); assert.equal(r.status, 400); ok('action inválida → 400');

  // límite de velocidad
  let last; for (let i = 0; i < 35; i++) last = await req(port, 'POST', '/api/app/login/start');
  assert.equal(last.status, 429); ok('rate limit en login/start → 429');

  console.log(`\n✅ ${n} pruebas OK`); server.close(); process.exit(0);
})().catch(e => { console.error('\n❌ FALLO:', e); process.exit(1); });
