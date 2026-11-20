const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../utils/levels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top usuarios por mensajes enviados'),

  async execute(interaction) {
    const top = getLeaderboard(10);

    if (top.length === 0) {
      return interaction.reply({ content: 'Aún no hay datos de niveles.', ephemeral: true });
    }

    const lines = await Promise.all(top.map(async (u, i) => {
      const user = await interaction.client.users.fetch(u.id).catch(() => null);
      const name = user ? user.username : `ID:${u.id}`;
      return `**${i + 1}.** ${name} — Nivel ${u.level} (${u.xp} XP)`;
    }));

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🏆 Leaderboard de Niveles')
      .setDescription(lines.join('\n'))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
