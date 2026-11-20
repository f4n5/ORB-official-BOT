const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const { isAdminOrOwner } = require('../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('Envía el mensaje de normas + botón de verificación a este canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!(await isAdminOrOwner(interaction.member))) {
      return interaction.reply({ content: '❌ Solo Admin/Owner.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📜 Normas del Servidor')
      .setDescription(
        `Bienvenido/a al servidor.

**1.** Respeta a todos los miembros. No se tolera racismo, homofobia, sexismo ni cualquier discurso de odio.
**2.** No spam ni flood en los canales.
**3.** No compartas enlaces sospechosos, phishing ni contenido malicioso.
**4.** No hagas publicidad sin permiso.
**5.** Usa los canales para su propósito.
**6.** Sigue las [Normas de la Comunidad de Discord](https://discord.com/guidelines).

Al verificar aceptas estas normas.

Para verificar:
1. Haz clic en el botón de abajo
2. Resuelve la suma en la ventana que aparece (instantáneo)
3. Recibirás el rol de **Miembro** y verás todos los canales`
      )
      .setFooter({ text: 'Haz clic en el botón de abajo para empezar la verificación' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('start_verify')
        .setLabel('✅ Verificar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('start_verify_web')
        .setLabel('🌐 Verificar por web')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: '✅ Mensaje de verificación enviado.', ephemeral: true });
  }
};
