const config = require('../config');

const spamMap = new Map(); // userId -> { count, firstMsg }

// ========== EDITOR DE PALABRAS ==========
// Discord NO permite editar mensajes de otros usuarios.
// Por eso: reply "Modificado!" → borra el original → publica la versión corregida.
const phraseReplacements = [
  {
    // gg, ggs, gg!, good game, etc.
    pattern: /\b(ggs?|good\s*games?)\b/i,
    replacement: 'bien jugado!'
  },
  {
    // ez, easy, ezpz, etc.
    pattern: /\b(ez+|easy|ezpz)\b/i,
    replacement: 'soy tóxico!'
  },
  {
    // p2w, pay to win, pay2win
    pattern: /\b(p2w|pay\s*to\s*win|pay2win)\b/i,
    replacement: 'no me quejo.'
  },
  {
    // p2l, pay to lose, pay2lose
    pattern: /\b(p2l|pay\s*to\s*lose|pay2lose)\b/i,
    replacement: 'ah'
  }
];

function getPhraseReplacement(content) {
  for (const rule of phraseReplacements) {
    if (rule.pattern.test(content)) {
      return rule.replacement;
    }
  }
  return null;
}

async function handlePhraseEdit(message) {
  const replacement = getPhraseReplacement(message.content);
  if (!replacement) return false;

  try {
    // 1. Reply mientras el mensaje aún existe
    await message.reply({ content: 'Modificado!' });

    // 2. Borrar el original
    await message.delete().catch(() => {});

    // 3. Publicar la versión "editada"
    await message.channel.send({
      content: `**${message.author.username}**: ${replacement}`,
      allowedMentions: { parse: [] }
    });
  } catch (e) {
    console.error('Error en editor de palabras:', e.message);
  }
  return true;
}

// ========== ANTI WORDS / LINKS / SPAM ==========
function isBadWord(content) {
  const lower = content.toLowerCase();
  return config.badWords.some(word => lower.includes(word.toLowerCase()));
}

function isSuspiciousLink(content) {
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-z0-9-]+\.(com|net|org|xyz|tk|ml|ga|cf|gq)\/[^\s]*)/gi;
  const matches = content.match(urlRegex) || [];

  for (const url of matches) {
    const clean = url.toLowerCase();
    if (
      (clean.includes('discord') && !clean.includes('discord.com') && !clean.includes('discord.gg')) ||
      clean.includes('nitro') ||
      clean.includes('free-nitro') ||
      (clean.includes('steamcommunity') && clean.includes('gift')) ||
      clean.includes('bit.ly') ||
      clean.includes('tinyurl')
    ) {
      return true;
    }
  }
  return false;
}

function checkSpam(userId) {
  const now = Date.now();
  const entry = spamMap.get(userId);

  if (!entry || now - entry.firstMsg > config.antiSpam.timeWindow) {
    spamMap.set(userId, { count: 1, firstMsg: now });
    return false;
  }

  entry.count += 1;
  if (entry.count >= config.antiSpam.maxMessages) {
    spamMap.delete(userId);
    return true;
  }
  return false;
}

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return false;

  const content = message.content;

  // 1. Editor de palabras (gg, ez, p2w, p2l...)
  if (await handlePhraseEdit(message)) {
    return true;
  }

  // 2. AntiWords (odio / racismo)
  if (isBadWord(content)) {
    try {
      await message.delete();
      const warn = await message.channel.send({
        content: `⚠️ ${message.author}, ese tipo de lenguaje no está permitido aquí.`,
        allowedMentions: { users: [message.author.id] }
      });
      setTimeout(() => warn.delete().catch(() => {}), 5000);
    } catch {}
    return true;
  }

  // 3. AntiPhishing
  if (isSuspiciousLink(content)) {
    try {
      await message.delete();
      const warn = await message.channel.send({
        content: `🔗 ${message.author}, se detectó un enlace sospechoso y fue eliminado.`,
        allowedMentions: { users: [message.author.id] }
      });
      setTimeout(() => warn.delete().catch(() => {}), 6000);
    } catch {}
    return true;
  }

  // 4. AntiSpam
  if (checkSpam(message.author.id)) {
    try {
      await message.delete();
      if (message.member && message.member.moderatable) {
        await message.member.timeout(config.antiSpam.muteTime, 'AntiSpam automático');
      }
      const warn = await message.channel.send({
        content: `🚫 ${message.author} ha sido silenciado temporalmente por spam.`,
        allowedMentions: { users: [message.author.id] }
      });
      setTimeout(() => warn.delete().catch(() => {}), 8000);
    } catch {}
    return true;
  }

  return false;
}

module.exports = { handleMessage, isBadWord, isSuspiciousLink, getPhraseReplacement };
