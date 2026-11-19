const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ensureRole, isAdminOrOwner } = require('../utils/roles');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lineup')
    .setDescription('Asigna el rol LineUp a un usuario (solo Admin/Owner)')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario de Discord a quien dar el rol')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await isAdminOrOwner(interaction.member))) {
      return interaction.reply({
        content: '❌ Solo el Owner o usuarios con rol Admin pueden usar este comando.',
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('usuario');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: '❌ Usuario no encontrado en el servidor.', ephemeral: true });
    }

    const lineupRole = await ensureRole(interaction.guild, config.roles.lineup, {
      color: 0xFEE75C,
      hoist: true
    });

    if (member.roles.cache.has(lineupRole.id)) {
      return interaction.reply({
        content: `⚠️ ${target} ya tiene el rol **${config.roles.lineup}**.`,
        ephemeral: true
      });
    }

    await member.roles.add(lineupRole, `Asignado por ${interaction.user.tag} con /lineup`);
    await interaction.reply({
      content: `✅ Se le otorgó el rol **${config.roles.lineup}** a ${target}.`,
      ephemeral: false
    });
  }
};
