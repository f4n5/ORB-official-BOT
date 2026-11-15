const crypto = require('crypto');
const config = require('../config');

// Sesiones de verificación pendientes (token → { discordId, guildId, expires })
const pendingVerify = new Map();

function createVerifyToken(discordId, guildId) {
  const token = crypto.randomBytes(24).toString('hex');
  pendingVerify.set(token, {
    discordId,
    guildId,
    expires: Date.now() + 15 * 60 * 1000 // 15 min
  });
  setTimeout(() => pendingVerify.delete(token), 16 * 60 * 1000);
  return token;
}

module.exports = {
  name: 'interactionCreate',
  pendingVerify,

  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        const msg = { content: '❌ Hubo un error al ejecutar este comando.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
      return;
    }

    if (interaction.isButton() && interaction.customId === 'start_verify') {
      try {
        const token = createVerifyToken(interaction.user.id, interaction.guildId);
        const captchaUrl = `${config.publicUrl}/captcha?token=${token}`;

        await interaction.reply({
          content:
            `🔐 **Verificación**\n\n` +
            `1. Haz clic en el enlace de abajo\n` +
            `2. Resuelve el CAPTCHA\n` +
            `3. Recibirás el rol de **Miembro** automáticamente\n\n` +
            `[**👉 Ir al CAPTCHA**](${captchaUrl})\n\n` +
            `⚠️ El enlace expira en 15 minutos.`,
          ephemeral: true
        });
      } catch (e) {
        console.error('Error iniciando verificación:', e);
        await interaction.reply({
          content: '❌ Error al iniciar la verificación. Contacta a un admin.',
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
};
