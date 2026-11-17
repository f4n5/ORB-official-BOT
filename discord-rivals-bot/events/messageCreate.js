const { handleMessage } = require('../utils/automod');
const { addMessage } = require('../utils/levels');
const { isAdminOrOwner } = require('../utils/roles');
const config = require('../config');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    // ========== SOFT BAN CHANNEL ==========
    if (config.softbanChannelId && message.channel.id === config.softbanChannelId) {
      // Admins/Owner pueden escribir sin ser baneados
      if (message.member && (await isAdminOrOwner(message.member))) return;

      try {
        // 1) Primero se borra el mensaje y se intenta el ban...
        await message.delete().catch(() => {});

        if (!message.member || !message.member.bannable) {
          // (antes el bot anunciaba "baneado" aunque el ban fallara)
          console.error(`[SOFTBAN] No pude banear a ${message.author.tag}: permisos insuficientes o jerarquía de roles.`);
          return;
        }

        await message.member.ban({
          reason: 'Softban: habló en el canal de softban',
          deleteMessageSeconds: 60 * 60 // limpia la última hora de mensajes (por si es una cuenta hackeada)
        });

        // 2) ...y solo si funcionó, se anuncia
        await message.channel.send({
          content: `🚫 **Soft Ban**\n**${message.author.username}** habló en este canal y ha sido **baneado** del servidor.`,
          allowedMentions: { parse: [] }
        });
      } catch (e) {
        console.error('Error en softban:', e);
      }
      return; // No procesar niveles ni automod normal
    }

    // AutoMod normal
    const blocked = await handleMessage(message);
    if (blocked) return;

    // Sistema de niveles
    try {
      addMessage(message.author.id);
    } catch (e) {
      console.error('Error levels:', e);
    }
  }
};
