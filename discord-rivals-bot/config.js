require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  guildId: process.env.GUILD_ID,

  roles: {
    member: process.env.MEMBER_ROLE_NAME || 'Miembro',
    banned: process.env.BANNED_ROLE_NAME || 'Banned',
    lineup: process.env.LINEUP_ROLE_NAME || 'LineUp',
    admin: process.env.ADMIN_ROLE_NAME || 'Admin',
    appLinked: process.env.APP_LINKED_ROLE_NAME || 'Crypt3d'
  },

  verifyChannelId: process.env.VERIFY_CHANNEL_ID || null,
  softbanChannelId: process.env.SOFTBAN_CHANNEL_ID || null,
  testsChannelId: process.env.TESTS_CHANNEL_ID || null,

  softbanAlertMessage: process.env.SOFTBAN_ALERT_MESSAGE || null,

  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).trim().replace(/\/+$/, ''),
  sessionSecret: process.env.SESSION_SECRET || null,
  port: process.env.PORT || 3000,

  // Optional shared secret for Crypt3d desktop API
  appApiKey: process.env.CRYPT3D_APP_API_KEY || null,

  antiSpam: {
    maxMessages: 5,
    timeWindow: 7000,
    muteTime: 5 * 60 * 1000
  },

  badWords: [
    'nigger', 'nigga', 'faggot', 'retard', 'maricón', 'puto', 'puta',
    'negro de mierda', 'sudaca', 'indio de mierda', 'mongólico',
    'retrasado', 'autista de mierda', 'down de mierda'
  ]
};
