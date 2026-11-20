const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const NUMS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crea una encuesta con reacciones')
    .addStringOption(o => o.setName('pregunta').setDescription('La pregunta').setRequired(true).setMaxLength(200))
    .addStringOption(o => o.setName('opcion1').setDescription('Opción 1 (vacío = Sí/No)').setMaxLength(80))
    .addStringOption(o => o.setName('opcion2').setDescription('Opción 2').setMaxLength(80))
    .addStringOption(o => o.setName('opcion3').setDescription('Opción 3').setMaxLength(80))
    .addStringOption(o => o.setName('opcion4').setDescription('Opción 4').setMaxLength(80)),
  async execute(interaction) {
    const options = [1, 2, 3, 4].map(i => interaction.options.getString(`opcion${i}`)).filter(Boolean);
    const yesNo = options.length < 2;
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(`📊 ${interaction.options.getString('pregunta')}`)
      .setDescription(yesNo ? '✅ Sí\n❌ No' : options.map((o, i) => `${NUMS[i]} ${o}`).join('\n'))
      .setFooter({ text: `Encuesta de ${interaction.user.username}` });

    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    const emojis = yesNo ? ['✅', '❌'] : NUMS.slice(0, options.length);
    for (const e of emojis) await msg.react(e).catch(() => {});
  }
};
