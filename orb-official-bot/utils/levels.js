const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_PATH = path.join(DATA_DIR, 'levels.json');
fs.mkdirSync(DATA_DIR, { recursive: true }); // antes no existía -> los niveles nunca se guardaban

function load() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      fs.writeFileSync(DATA_PATH, '{}');
      return {};
    }
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function getUser(userId) {
  const data = load();
  if (!data[userId]) {
    data[userId] = { messages: 0, level: 0, xp: 0 };
    save(data);
  }
  return data[userId];
}

function addMessage(userId) {
  const data = load();
  if (!data[userId]) data[userId] = { messages: 0, level: 0, xp: 0 };
  data[userId].messages += 1;
  data[userId].xp += 1; // 1 XP por mensaje

  // Nivel = floor(sqrt(xp / 5)) o similar simple
  const newLevel = Math.floor(Math.sqrt(data[userId].xp / 10));
  const leveledUp = newLevel > data[userId].level;
  data[userId].level = newLevel;

  save(data);
  return { ...data[userId], leveledUp };
}

function getLeaderboard(limit = 10) {
  const data = load();
  return Object.entries(data)
    .map(([id, u]) => ({ id, ...u }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

module.exports = { getUser, addMessage, getLeaderboard, load };
