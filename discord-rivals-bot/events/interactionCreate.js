const {
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');
const config = require('../config');
const { signToken, createModalCaptcha, checkModalCaptcha } = require('../utils/tokens');
const { ensureRole, isAdminOrOwner } = require('../utils/roles');
const { notifyTryout } = require('../utils/tryouts');

const VERIFY_TTL = 15 * 60 * 1000;

function hasMemberRole(interaction) {
  const role = interaction.guild?.roles.cache.find(r => r.name === config.roles.member);
  return !!(role && interaction.member?.roles?.cache?.has(role.id));
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {
    try {
      // ================= SLASH COMMANDS =================
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        try {
          await command.execute(interaction);
        } catch (error) {
          console.error(error);
          const msg = { content: '❌ Hubo un error al ejecutar este comando.', ephemeral: true };
          if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
          else await interaction.reply(msg).catch(() => {});
        }
        return;
      }

      // ================= BOTONES =================
      if (interaction.isButton()) {
        const id = interaction.customId;

        // --- Verificación RÁPIDA: CAPTCHA en un modal de Discord (sin abrir la web) ---
        if (id === 'start_verify') {
          if (hasMemberRole(interaction)) {
            return interaction.reply({ content: '✅ Ya estás verificado.', ephemeral: true });
          }
          const { a, b, customId } = createModalCaptcha(interaction.user.id);
          const modal = new ModalBuilder()
            .setCustomId(customId)
            .setTitle('Verificación')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('answer')
                  .setLabel(`¿Cuánto es ${a} + ${b}?`)
                  .setStyle(TextInputStyle.Short)
                  .setMinLength(1).setMaxLength(3)
                  .setPlaceholder('Escribe solo el número')
                  .setRequired(true)
              )
            );
          return interaction.showModal(modal);
        }

        // --- Verificación por WEB (alternativa) ---
        if (id === 'start_verify_web') {
          if (hasMemberRole(interaction)) {
            return interaction.reply({ content: '✅ Ya estás verificado.', ephemeral: true });
          }
          const token = signToken('verify', { d: interaction.user.id, g: interaction.guildId }, VERIFY_TTL);
          const url = `${config.publicUrl}/captcha?token=${token}`;
          return interaction.reply({
            content: `🌐 **Verificación web**\n[**👉 Ir al CAPTCHA**](${url})\n\n⚠️ Expira en 15 minutos. Si la web tarda en cargar, usa el botón **Verificar** del mensaje (es instantáneo).`,
            ephemeral: true
          });
        }

        // --- Solicitar tryout SIN iniciar sesión web (funciona aunque Discord bloquee la IP de Render) ---
        if (id === 'tryout_request') {
          await interaction.deferReply({ ephemeral: true });
          const result = await notifyTryout(interaction.client, {
            discordId: interaction.user.id,
            username: interaction.user.username,
            member: interaction.member
          });
          if (!result.ok) {
            return interaction.editReply({ content: `${result.code === 'cooldown' ? '⏳' : '❌'} ${result.error}` });
          }
          return interaction.editReply({
            content: `✅ **¡Tryout solicitado!** Ya avisamos al Owner y a los Admins.\nRealiza las **3 pruebas: DL, SDL y CL** y está pendiente de <#${config.testsChannelId}>.`
          });
        }

        // --- Botones para el staff en el aviso de tryout ---
        if (id.startsWith('tryout_claim:') || id.startsWith('tryout_approve:') || id.startsWith('tryout_reject:')) {
          if (!(await isAdminOrOwner(interaction.member))) {
            return interaction.reply({ content: '❌ Solo Admin/Owner.', ephemeral: true });
          }
          const [action, targetId] = id.split(':');
          const target = await interaction.guild.members.fetch(targetId).catch(() => null);

          if (action === 'tryout_claim') {
            await interaction.reply({
              content: `🙋 ${interaction.user} se encargará del tryout de <@${targetId}>.`,
              allowedMentions: { users: [targetId] }
            });
            return;
          }

          const approved = action === 'tryout_approve';
          if (approved && target) {
            const role = await ensureRole(interaction.guild, config.roles.lineup, { color: 0xFEE75C, hoist: true });
            await target.roles.add(role, `Tryout aprobado por ${interaction.user.tag}`).catch(e => console.error('[TRYOUT] rol:', e.message));
          }
          if (target) {
            await target.send(approved
              ? `✅ ¡Tu tryout en **${interaction.guild.name}** fue **aprobado**! Recibiste el rol **${config.roles.lineup}**.`
              : `❌ Tu tryout en **${interaction.guild.name}** no fue aprobado esta vez. ¡Sigue practicando y vuelve a intentarlo!`
            ).catch(() => {});
          }
          // Quita los botones del aviso original y deja constancia
          await interaction.update({
            content: `${interaction.message.content}\n\n${approved ? '✅ **APROBADO**' : '❌ **RECHAZADO**'} por ${interaction.user}`,
            components: [],
            allowedMentions: { parse: [] }
          });
          return;
        }
        return;
      }

      // ================= MODAL: respuesta del CAPTCHA =================
      if (interaction.isModalSubmit() && interaction.customId.startsWith('vm:')) {
        await interaction.deferReply({ ephemeral: true });
        const check = checkModalCaptcha(interaction.user.id, interaction.customId, interaction.fields.getTextInputValue('answer'));

        if (!check.ok) {
          const msg = check.reason === 'wrong' ? '❌ Respuesta incorrecta.' : '⏳ El CAPTCHA expiró.';
          return interaction.editReply({ content: `${msg} Pulsa **Verificar** otra vez para intentarlo de nuevo.` });
        }

        try {
          const role = await ensureRole(interaction.guild, config.roles.member, { color: 0x57F287, hoist: true });
          if (!interaction.member.roles.cache.has(role.id)) {
            await interaction.member.roles.add(role, 'Verificado por CAPTCHA');
          }
          return interaction.editReply({ content: `✅ **¡Verificado!** Ya tienes el rol **${config.roles.member}**.` });
        } catch (err) {
          console.error('Error asignando rol de verificación:', err);
          return interaction.editReply({
            content: err.code === 50013
              ? '❌ No puedo darte el rol: el rol del bot debe estar **por encima** de **Miembro** en Ajustes → Roles.'
              : '❌ Error al asignar el rol. Contacta a un admin.'
          });
        }
      }
    } catch (e) {
      console.error('[interactionCreate]', e);
      const msg = { content: '❌ Error inesperado. Inténtalo de nuevo.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else if (interaction.reply) await interaction.reply(msg).catch(() => {});
    }
  }
};
