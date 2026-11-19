const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Muestra el avatar de un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  async execute(interaction) {
    const user = interaction.options.getUser('usuario') || interaction.user;
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`🖼️ Avatar de ${user.username}`)
      .setImage(user.displayAvatarURL({ size: 1024 }));
    await interaction.reply({ embeds: [embed] });
  }
};
