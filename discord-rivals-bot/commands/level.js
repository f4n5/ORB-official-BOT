const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, getLeaderboard } = require('../utils/levels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Muestra tu nivel o el de otro usuario (basado en mensajes enviados)')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario a consultar (opcional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('usuario') || interaction.user;
    const data = getUser(target.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 Nivel de ${target.username}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Nivel', value: `${data.level}`, inline: true },
        { name: 'XP / Mensajes', value: `${data.xp}`, inline: true },
        { name: 'Mensajes totales', value: `${data.messages}`, inline: true }
      )
      .setFooter({ text: '1 mensaje = 1 XP • Nivel = √(XP / 10)' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
