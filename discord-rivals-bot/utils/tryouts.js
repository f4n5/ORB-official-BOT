const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

const COOLDOWN_MS = 10 * 60 * 1000;
const cooldown = new Map(); // discordId → timestamp de la última solicitud

setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of cooldown) if (now - ts > COOLDOWN_MS) cooldown.delete(id);
}, 5 * 60 * 1000).unref();

/**
 * Notifica en el canal de tryouts (TESTS_CHANNEL_ID) al Owner/Admin y al usuario.
 * Se usa tanto al iniciar sesión desde el botón de /tryout-setup como desde el dashboard.
 *
 * @returns {Promise<{ok:true, messageUrl:string, channelUrl:string, dmSent:boolean}
 *                  |{ok:false, code:string, error:string}>}
 */
async function notifyTryout(client, { discordId, username, member: knownMember = null }) {
  if (!config.testsChannelId) {
    return { ok: false, code: 'config', error: 'TESTS_CHANNEL_ID no está configurado en el servidor.' };
  }

  const last = cooldown.get(discordId);
  if (last && Date.now() - last < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 60000);
    return { ok: false, code: 'cooldown', error: `Ya enviaste una solicitud hace poco. Espera ${mins} min antes de volver a intentarlo.` };
  }

  // Primero caché (0 llamadas a la API); solo si no está, se pide a Discord
  const channel = client.channels.cache.get(config.testsChannelId)
    || await client.channels.fetch(config.testsChannelId).catch(() => null);
  if (!channel || !channel.guild || !channel.isTextBased()) {
    return { ok: false, code: 'channel', error: 'No encuentro el canal de tryouts. Avisa a un administrador.' };
  }

  const guild = channel.guild;
  const member = knownMember
    || guild.members.cache.get(discordId)
    || await guild.members.fetch(discordId).catch(() => null);
  if (!member) {
    return { ok: false, code: 'not_member', error: 'Debes estar dentro del servidor de Discord para solicitar un tryout.' };
  }

  // Menciones: Owner + rol Admin (si existe)
  const adminRole = guild.roles.cache.find(r => r.name === config.roles.admin);
  const pings = [`<@${guild.ownerId}>`];
  if (adminRole) pings.push(`<@&${adminRole.id}>`);

  const content =
    `${pings.join(' ')}\n\n` +
    `🧪 **Nueva solicitud de tryout**\n` +
    `👤 Usuario: <@${discordId}> (\`${username}\`)\n\n` +
    `<@${discordId}>, para completar tu tryout debes:\n` +
    `1️⃣ Realizar las **3 pruebas**: **DL**, **SDL** y **CL**.\n` +
    `2️⃣ Estar pendiente de este canal: un **Admin/Owner** te contactará.\n` +
    `3️⃣ No mencionar a los admins: ya fueron notificados.\n\n` +
    `*Solicitud generada al iniciar sesión con Discord.*`;

  // Comprobar permisos ANTES de enviar para dar un error claro
  const me = guild.members.me;
  const perms = me && channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    console.error('[TRYOUT] El bot no tiene permisos de Ver/Enviar en el canal de tryouts.');
    return { ok: false, code: 'send', error: 'El bot no tiene permisos para escribir en el canal de tryouts. Avisa a un administrador.' };
  }

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tryout_claim:${discordId}`).setLabel('Tomar tryout').setEmoji('🙋').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tryout_approve:${discordId}`).setLabel('Aprobar').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tryout_reject:${discordId}`).setLabel('Rechazar').setEmoji('❌').setStyle(ButtonStyle.Danger)
  );

  let msg;
  try {
    msg = await channel.send({
      content,
      components: [actions],
      allowedMentions: {
        users: [...new Set([guild.ownerId, discordId])], // sin duplicados: si el Owner pide el tryout, Discord daba error 50035
        roles: adminRole ? [adminRole.id] : []
      }
    });
  } catch (err) {
    console.error('[TRYOUT] No pude enviar el aviso:', err.code, err.message);
    const limited = err.status === 429 || err.code === 'RateLimitError';
    return { ok: false, code: 'send', error: limited ? 'Discord está limitando temporalmente al bot. Intenta de nuevo en 1-2 minutos.' : 'No pude enviar el aviso al canal (revisa los permisos del bot).' };
  }

  cooldown.set(discordId, Date.now());

  // Aviso por DM al usuario (best-effort: puede tener los DMs cerrados)
  const dmSent = await member
    .send(
      `🧪 **Tryout solicitado en ${guild.name}**\n\n` +
      `Para completar tu tryout debes realizar las **3 pruebas**: **DL**, **SDL** y **CL**.\n` +
      `Un Admin/Owner fue notificado y te contactará en <#${channel.id}>.\n` +
      `${msg.url}`
    )
    .then(() => true)
    .catch(() => false);

  return {
    ok: true,
    messageUrl: msg.url,
    channelUrl: `https://discord.com/channels/${guild.id}/${channel.id}`,
    dmSent
  };
}

module.exports = { notifyTryout };
