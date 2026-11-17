const { handleMessage } = require('../utils/automod');
const config = require('../config');

// Revisa también los mensajes EDITADOS (antes bastaba con editar un mensaje limpio para saltarse el AutoMod)
module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage) {
    try {
      if (newMessage.partial) newMessage = await newMessage.fetch();
      if (!newMessage.guild || !newMessage.author || newMessage.author.bot) return;
      if (config.softbanChannelId && newMessage.channel.id === config.softbanChannelId) return;
      if (oldMessage.content === newMessage.content) return; // solo cambió un embed/preview

      await handleMessage(newMessage, { edited: true });
    } catch (e) {
      if (e.code !== 10008) console.error('Error en messageUpdate:', e.message); // 10008 = mensaje ya borrado
    }
  }
};
