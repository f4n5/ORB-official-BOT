/**
 * Drop-in /app-link command for your Discord bot on the OTHER host.
 * Requires env:
 *   CRYPT3D_WEB_URL=https://your-render-service.onrender.com
 *   BOT_INTERNAL_KEY=same_as_render
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

const MEMBER_ROLE = process.env.MEMBER_ROLE_NAME || 'Miembro';
const WEB = (process.env.CRYPT3D_WEB_URL || '').replace(/\/+$/, '');
const BOT_KEY = process.env.BOT_INTERNAL_KEY || '';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('app-link')
    .setDescription('Código para iniciar sesión en Crypt3d'),

  async execute(interaction) {
    const role = interaction.guild?.roles.cache.find(r => r.name === MEMBER_ROLE);
    if (!role || !interaction.member.roles.cache.has(role.id)) {
      return interaction.reply({
        content: '❌ Primero verifica en el servidor (rol Miembro).',
        ephemeral: true
      });
    }
    if (!WEB) {
      return interaction.reply({ content: '❌ CRYPT3D_WEB_URL no configurada en el bot.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const res = await fetch(`${WEB}/api/internal/create-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-Key': BOT_KEY
        },
        body: JSON.stringify({
          discordId: interaction.user.id,
          username: interaction.user.username
        })
      });
      const data = await res.json();
      if (!data.ok || !data.code) {
        return interaction.editReply(`❌ No se pudo crear el código (${data.error || res.status}).`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x7C3AED)
        .setTitle('🔗 Código para Crypt3d')
        .setDescription(
          `Válido **10 minutos**:\n\n# \`${data.code}\`\n\n` +
          `Pégalo en Crypt3d → **Account / Login**.`
        );
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      return interaction.editReply(`❌ Error contactando Render: ${e.message}`);
    }
  }
};
