const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Comprueba la latencia del bot'),
  async execute(interaction) {
    const up = Math.floor(process.uptime());
    await interaction.reply({
      content: `🏓 Pong · WS: **${interaction.client.ws.ping} ms** · Activo: **${Math.floor(up / 3600)}h ${Math.floor(up % 3600 / 60)}m**`,
      ephemeral: true
    });
  }
};
