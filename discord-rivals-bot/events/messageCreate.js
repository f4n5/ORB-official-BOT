const { handleMessage } = require('../utils/automod');
const { addMessage } = require('../utils/levels');
const config = require('../config');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    // ========== SOFT BAN CHANNEL ==========
    // Si alguien escribe en el canal de softban → se le banea y el bot deja un mensaje
    if (config.softbanChannelId && message.channel.id === config.softbanChannelId) {
      try {
        // Mensaje de aviso en el mismo canal
        await message.channel.send({
          content: `🚫 **Soft Ban**\n${message.author} habló en este canal y ha sido **baneado** del servidor.\nRazón: Hablar en el canal de softban.`
        });

        // Banear al usuario
        if (message.member && message.member.bannable) {
          await message.member.ban({
            reason: 'Softban: habló en el canal de softban',
            deleteMessageSeconds: 0
          });
        } else {
          console.error('No se pudo banear: el bot no tiene permisos o el usuario es superior.');
        }

        // Intentar borrar el mensaje original
        await message.delete().catch(() => {});
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
