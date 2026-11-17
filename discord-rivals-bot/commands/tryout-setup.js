const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const { isAdminOrOwner } = require('../utils/roles');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tryout-setup')
    .setDescription('Envía al canal de tryouts el mensaje con el botón de inicio de sesión')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await isAdminOrOwner(interaction.member))) {
      return interaction.reply({ content: '❌ Solo Admin/Owner.', ephemeral: true });
    }

    if (!config.testsChannelId) {
      return interaction.reply({
        content: '❌ Falta la variable de entorno `TESTS_CHANNEL_ID` (ID del canal de tryouts).',
        ephemeral: true
      });
    }

    const channel = await interaction.client.channels.fetch(config.testsChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.guildId !== interaction.guildId) {
      return interaction.reply({
        content: '❌ No encuentro el canal `TESTS_CHANNEL_ID` en este servidor. Revisa que el ID sea correcto.',
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

    const loginUrl = `${config.publicUrl}/auth/discord?intent=tryout`;

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('🧪 Canal de Tryouts')
      .setDescription(
        `En este canal se realizan los **tryouts**.\n\n` +
        `👉 **Haz clic en el botón de abajo** para **iniciar sesión con Discord**. ` +
        `Al hacerlo se notificará automáticamente al **Owner** y a los **Admins** de que quieres hacer tu tryout.\n\n` +
        `**¿Qué debes hacer después de iniciar sesión?**\n` +
        `• Completar las **3 pruebas**: **DL**, **SDL** y **CL**.\n` +
        `• Estar pendiente de este canal: un Admin/Owner te contactará.\n` +
        `• No mencionar a los admins ni hacer spam: ya serán avisados.`
      )
      .setFooter({ text: 'Debes estar dentro del servidor para solicitar tu tryout' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Iniciar sesión con Discord')
        .setEmoji('🔐')
        .setStyle(ButtonStyle.Link)
        .setURL(loginUrl)
    );

    try {
      await channel.send({ embeds: [embed], components: [row] });
    } catch (err) {
      console.error('[tryout-setup]', err);
      return interaction.reply({ content: `❌ No pude enviar el mensaje: ${err.message}`, ephemeral: true });
    }

    await interaction.reply({ content: `✅ Mensaje de tryouts enviado en <#${channel.id}>.`, ephemeral: true });
  }
};
