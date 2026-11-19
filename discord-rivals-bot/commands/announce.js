const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdminOrOwner } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Publica un anuncio en este canal (Admin/Owner)')
    .addStringOption(o => o.setName('titulo').setDescription('Título').setRequired(true).setMaxLength(100))
    .addStringOption(o => o.setName('mensaje').setDescription('Texto (usa \\n para saltos de línea)').setRequired(true).setMaxLength(1500))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!(await isAdminOrOwner(interaction.member))) {
      return interaction.reply({ content: '❌ Solo Admin/Owner.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📢 ${interaction.options.getString('titulo')}`)
      .setDescription(interaction.options.getString('mensaje').replace(/\\n/g, '\n'))
      .setFooter({ text: `Por ${interaction.user.username}` })
      .setTimestamp();
    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({ content: '✅ Anuncio enviado.', ephemeral: true });
  }
};
