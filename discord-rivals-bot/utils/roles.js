const config = require('../config');

async function ensureRole(guild, name, options = {}) {
  let role = guild.roles.cache.find(r => r.name === name);
  if (!role) {
    role = await guild.roles.create({
      name,
      color: options.color || 0x5865F2,
      reason: 'Rol creado automáticamente por el bot',
      hoist: options.hoist || false,
      mentionable: options.mentionable || false
    });
    console.log(`[ROLES] Creado rol: ${name}`);
  }
  return role;
}

async function setupVerificationRoles(guild) {
  const memberRole = await ensureRole(guild, config.roles.member, { color: 0x57F287, hoist: true });
  const bannedRole = await ensureRole(guild, config.roles.banned, { color: 0xED4245, hoist: true });
  const lineupRole = await ensureRole(guild, config.roles.lineup, { color: 0xFEE75C, hoist: true });

  // @everyone no puede ver canales (el admin debe configurar permisos de canales)
  // El rol Miembro debe tener ViewChannel en los canales deseados

  return { memberRole, bannedRole, lineupRole };
}

async function isAdminOrOwner(member) {
  if (member.id === member.guild.ownerId) return true;
  if (member.permissions.has('Administrator')) return true;
  const adminRole = member.guild.roles.cache.find(r => r.name === config.roles.admin);
  if (adminRole && member.roles.cache.has(adminRole.id)) return true;
  return false;
}

module.exports = { ensureRole, setupVerificationRoles, isAdminOrOwner };
