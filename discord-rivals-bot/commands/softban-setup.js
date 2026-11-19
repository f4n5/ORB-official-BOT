const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { isAdminOrOwner } = require('../utils/roles');
const config = require('../config');

const DEFAULT_ALERT =
  `**NO envíes mensajes en este canal.**\n\n` +
  `Cualquier mensaje enviado aquí resultará en un **soft ban automático**.\n\n` +
  `Si llegaste aquí por error, **no escribas nada** y sal del canal.`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('softban-setup')
    .setDescription('Envía el mensaje de alerta al canal de soft ban')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await isAdminOrOwner(interaction.member))) {
      return interaction.reply({ content: '❌ Solo Admin/Owner.', ephemeral: true });
    }

    if (!config.softbanChannelId) {
      return interaction.reply({
        content: '❌ Falta la variable de entorno `SOFTBAN_CHANNEL_ID` (ID del canal de soft ban).',
        ephemeral: true
      });
    }

    const channel = await interaction.client.channels.fetch(config.softbanChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.guildId !== interaction.guildId) {
      return interaction.reply({
        content: '❌ No encuentro el canal `SOFTBAN_CHANNEL_ID` en este servidor. Revisa que el ID sea correcto.',
        ephemeral: true
      });
    }

    const perms = channel.permissionsFor(interaction.guild.members.me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return interaction.reply({
        content: `❌ No tengo permisos para **ver, escribir y enviar embeds** en <#${channel.id}>.`,
        ephemeral: true
      });
    }

    // El texto puede venir del entorno (SOFTBAN_ALERT_MESSAGE); si no, se usa el predeterminado
    const description = config.softbanAlertMessage
      ? config.softbanAlertMessage.replace(/\\n/g, '\n')
      : DEFAULT_ALERT;

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🚨 ZONA DE SOFT BAN')
      .setDescription(description)
      .setFooter({ text: 'Este canal es una trampa: escribir aquí = soft ban' })
      .setTimestamp();

    try {
      await channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('[softban-setup]', err);
      return interaction.reply({ content: `❌ No pude enviar el mensaje: ${err.message}`, ephemeral: true });
    }

    // Si nadie puede escribir ahí, el soft ban nunca se activaría
    const memberRole = interaction.guild.roles.cache.find(r => r.name === config.roles.member) || interaction.guild.roles.everyone;
    const canTalk = channel.permissionsFor(memberRole)?.has(PermissionFlagsBits.SendMessages);

    await interaction.reply({
      content:
        `✅ Alerta enviada en <#${channel.id}>.` +
        (canTalk ? '' : `\n⚠️ El rol **${memberRole.name}** no tiene permiso de **Enviar mensajes** en ese canal, así que nadie podrá caer en el soft ban. Actívalo en los permisos del canal.`),
      ephemeral: true
    });
  }
};
