const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { isAdminOrOwner } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra mensajes del canal (máx. 100, menos de 14 días)')
    .addIntegerOption(o => o.setName('cantidad').setDescription('1-100').setMinValue(1).setMaxValue(100).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    if (!(await isAdminOrOwner(interaction.member))) {
      return interaction.reply({ content: '❌ Solo Admin/Owner.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const deleted = await interaction.channel.bulkDelete(interaction.options.getInteger('cantidad'), true);
      await interaction.editReply(`🧹 Borrados **${deleted.size}** mensajes.`);
    } catch (e) {
      await interaction.editReply('❌ No pude borrar (revisa que tenga **Gestionar mensajes**).');
    }
  }
};
