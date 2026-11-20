const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../utils/levels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Información de un usuario')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario (opcional)')),
  async execute(interaction) {
    const user = interaction.options.getUser('usuario') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const lvl = getUser(user.id);
    const roles = member ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).slice(0, 15).join(' ') || 'Ninguno' : 'N/D';

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || 0x5865F2)
      .setTitle(`👤 ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Cuenta creada', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Se unió', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/D', inline: true },
        { name: 'Nivel', value: `${lvl.level} (${lvl.xp} XP)`, inline: true },
        { name: 'Roles', value: roles }
      );
    await interaction.reply({ embeds: [embed] });
  }
};
