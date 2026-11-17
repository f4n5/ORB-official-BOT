const config = require('../config');
const { signToken } = require('../utils/tokens');

const VERIFY_TTL = 15 * 60 * 1000; // 15 min

// Token firmado (HMAC): sigue siendo válido aunque Render reinicie el servicio
function createVerifyToken(discordId, guildId) {
  return signToken('verify', { d: discordId, g: guildId }, VERIFY_TTL);
}

module.exports = {
  name: 'interactionCreate',

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
        // Si ya está verificado, no hace falta repetir el captcha
        const memberRole = interaction.guild?.roles.cache.find(r => r.name === config.roles.member);
        if (memberRole && interaction.member?.roles?.cache?.has(memberRole.id)) {
          return interaction.reply({ content: '✅ Ya estás verificado.', ephemeral: true });
        }

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
