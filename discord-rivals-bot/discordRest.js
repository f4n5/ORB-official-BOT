const fetch = require('node-fetch');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const MEMBER_ROLE = process.env.MEMBER_ROLE_NAME || 'Miembro';
const APP_ROLE = process.env.APP_LINKED_ROLE_NAME || 'Crypt3d';

async function discord(path, options = {}) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Crypt3dWeb (Render, 1.0)',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const t = await res.text();
    const err = new Error(`Discord ${res.status}: ${t.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getMember(discordId) {
  if (!TOKEN || !GUILD_ID) return null;
  try {
    return await discord(`/guilds/${GUILD_ID}/members/${discordId}`);
  } catch {
    return null;
  }
}

async function listRoles() {
  if (!TOKEN || !GUILD_ID) return [];
  try {
    return await discord(`/guilds/${GUILD_ID}/roles`);
  } catch {
    return [];
  }
}

async function memberHasRoleName(discordId, roleName) {
  const member = await getMember(discordId);
  if (!member) return false;
  const roles = await listRoles();
  const role = roles.find(r => r.name === roleName);
  if (!role) return false;
  return (member.roles || []).includes(role.id);
}

async function isVerifiedMember(discordId) {
  return memberHasRoleName(discordId, MEMBER_ROLE);
}

async function ensureRoleAndAssign(discordId, roleName, color) {
  if (!TOKEN || !GUILD_ID) return false;
  const roles = await listRoles();
  let role = roles.find(r => r.name === roleName);
  if (!role) {
    role = await discord(`/guilds/${GUILD_ID}/roles`, {
      method: 'POST',
      body: JSON.stringify({ name: roleName, color: color || 0x57F287, hoist: true })
    });
  }
  await discord(`/guilds/${GUILD_ID}/members/${discordId}/roles/${role.id}`, { method: 'PUT' });
  return true;
}

async function assignMemberRole(discordId) {
  return ensureRoleAndAssign(discordId, MEMBER_ROLE, 0x57F287);
}

async function assignAppLinkedRole(discordId) {
  try {
    return await ensureRoleAndAssign(discordId, APP_ROLE, 0x7C3AED);
  } catch {
    return false;
  }
}

module.exports = {
  isVerifiedMember,
  assignMemberRole,
  assignAppLinkedRole,
  getMember
};
