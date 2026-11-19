const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LINKS_FILE = path.join(DATA_DIR, 'app-links.json');
const LINKED_FILE = path.join(DATA_DIR, 'app-linked-users.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(file, fallback) {
  try {
    ensureDataDir();
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

/** One-time 6-char code, valid 10 minutes */
function createLinkCode(discordId, username) {
  const codes = loadJson(LINKS_FILE, {});
  const now = Date.now();
  for (const [k, v] of Object.entries(codes)) {
    if (v.exp < now) delete codes[k];
  }
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  codes[code] = {
    discordId: String(discordId),
    username: username || 'User',
    exp: now + 10 * 60 * 1000
  };
  saveJson(LINKS_FILE, codes);
  return code;
}

function consumeLinkCode(code) {
  if (!code || typeof code !== 'string') return { ok: false, reason: 'invalid' };
  const normalized = code.trim().toUpperCase();
  const codes = loadJson(LINKS_FILE, {});
  const entry = codes[normalized];
  if (!entry) return { ok: false, reason: 'not_found' };
  if (Date.now() > entry.exp) {
    delete codes[normalized];
    saveJson(LINKS_FILE, codes);
    return { ok: false, reason: 'expired' };
  }
  delete codes[normalized];
  saveJson(LINKS_FILE, codes);

  const linked = loadJson(LINKED_FILE, {});
  linked[entry.discordId] = { username: entry.username, linkedAt: Date.now() };
  saveJson(LINKED_FILE, linked);

  return { ok: true, discordId: entry.discordId, username: entry.username };
}

function getLinkedUser(discordId) {
  const linked = loadJson(LINKED_FILE, {});
  return linked[String(discordId)] || null;
}

function isLinked(discordId) {
  return !!getLinkedUser(discordId);
}

module.exports = { createLinkCode, consumeLinkCode, getLinkedUser, isLinked };
