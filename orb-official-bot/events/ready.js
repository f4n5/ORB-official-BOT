const { ActivityType } = require('discord.js');
const { setupVerificationRoles } = require('../utils/roles');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Bot listo como ${client.user.tag}`);

    client.user.setActivity('Rivals | /level', { type: ActivityType.Playing });

    // Asegurar roles en todos los guilds
    for (const [, guild] of client.guilds.cache) {
      try {
        await setupVerificationRoles(guild);
      } catch (e) {
        console.error(`Error creando roles en ${guild.name}:`, e.message);
      }
    }
  }
};
