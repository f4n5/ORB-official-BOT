const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { createLinkCode } = require('../utils/appLinks');

/**
 * /app-link — code for Crypt3d desktop login.
 * Requires Member role (already verified in Discord).
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('app-link')
    .setDescription('Genera un código para iniciar sesión en Crypt3d (app de escritorio)'),

  async execute(interaction) {
    const memberRole = interaction.guild?.roles.cache.find(r => r.name === config.roles.member);
    const hasMember = memberRole && interaction.member?.roles?.cache?.has(memberRole.id);

    if (!hasMember) {
      return interaction.reply({
        content: '❌ Primero debes **verificar** en este servidor (botón Verificar / CAPTCHA) para usar Crypt3d.',
        ephemeral: true
      });
    }

    const code = createLinkCode(interaction.user.id, interaction.user.username);

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle('🔗 Código para Crypt3d')
      .setDescription(
        `Tu código de enlace (válido **10 minutos**):\n\n` +
        `# \`${code}\`\n\n` +
        `1. Abre **Crypt3d**\n` +
        `2. Pega el código en **Iniciar sesión / Account**\n` +
        `3. La app dirá **Bienvenido @${interaction.user.username}** y desbloqueará las funciones\n\n` +
        `_No compartas este código._`
      )
      .setFooter({ text: 'Crypt3d bot' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
