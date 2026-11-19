const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || process.env.DISCORD_TOKEN || 'change-me';

function mac(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function signToken(type, payload, ttlMs) {
  const body = Buffer.from(JSON.stringify({ ...payload, t: type, exp: Date.now() + ttlMs })).toString('base64url');
  return `${body}.${mac(`tok:${body}`)}`;
}

function verifyToken(token, type) {
  if (typeof token !== 'string' || token.length > 2000) return { ok: false, reason: 'invalid' };
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return { ok: false, reason: 'invalid' };
  if (!safeEqual(sig, mac(`tok:${body}`))) return { ok: false, reason: 'invalid' };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (payload.t !== type) return { ok: false, reason: 'invalid' };
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

const CAPTCHA_TTL = 10 * 60 * 1000;

function createCaptcha(token) {
  const a = crypto.randomInt(1, 11);
  const b = crypto.randomInt(1, 11);
  const exp = Date.now() + CAPTCHA_TTL;
  const challenge = `${exp}.${mac(`cap:${token}:${a + b}:${exp}`)}`;
  return { a, b, challenge };
}

function checkCaptcha(token, challenge, answer) {
  const [expStr, sig] = String(challenge || '').split('.');
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp)) return { ok: false, reason: 'invalid' };
  if (Date.now() > exp) return { ok: false, reason: 'expired' };
  const n = Number.parseInt(String(answer).trim(), 10);
  if (!Number.isFinite(n)) return { ok: false, reason: 'wrong' };
  return safeEqual(sig, mac(`cap:${token}:${n}:${exp}`)) ? { ok: true } : { ok: false, reason: 'wrong' };
}

module.exports = { signToken, verifyToken, createCaptcha, checkCaptcha };
