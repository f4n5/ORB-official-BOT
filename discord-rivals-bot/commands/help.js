const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Muestra todos los comandos del bot'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📖 Comandos')
      .addFields(
        { name: '👥 Todos', value: '`/level` `/leaderboard` `/userinfo` `/serverinfo` `/avatar` `/poll` `/ping` `/help`' },
        { name: '🛡️ Admin / Owner', value: '`/setup-verify` `/tryout-setup` `/softban-setup` `/lineup` `/clear` `/announce`' }
      )
      .setFooter({ text: 'Verifica con el botón del canal de normas · Tryouts con el botón del canal de tryouts' });
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
