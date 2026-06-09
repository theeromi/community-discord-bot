// utils.js — shared helpers

/**
 * Ensures a role exists in the guild, creates it if missing.
 * @param {Guild} guild - The Discord guild.
 * @param {string} roleName - The name of the role to ensure.
 * @param {object} options - Optional: color, permissions.
 * @returns {Promise<Role>} The found or created role.
 */
async function ensureRole(guild, roleName, options = {}) {
  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    try {
      const roleData = {
        name: roleName,
        permissions: options.permissions || [],
        reason: options.reason || 'Auto-created by bot'
      };
      if (options.color !== null && options.color !== undefined) {
        roleData.color = options.color;
      }
      role = await guild.roles.create(roleData);
      console.log(`✅ Created role "${roleName}" in ${guild.name}`);
    } catch (error) {
      console.error(`❌ Failed to create role "${roleName}" in ${guild.name}:`, error);
    }
  }
  return role;
}

/**
 * Substitutes {placeholder} tokens in a template string.
 * Unknown placeholders are left intact so missing values are visible.
 * @param {string} template
 * @param {Record<string, any>} vars
 * @returns {string}
 */
function formatMessage(template, vars = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
  );
}

function _branding(config) {
  return (config && config.branding) || {};
}

/**
 * Format an amount with the configured currency symbol and code.
 * Example: formatCurrency(1234, config) → "$1,234 JMD"
 */
function formatCurrency(amount, config) {
  const b = _branding(config);
  const symbol = b.currencySymbol ?? '$';
  const code = b.currencyCode ?? 'JMD';
  const formatted = typeof amount === 'number' ? amount.toLocaleString() : String(amount);
  return `${symbol}${formatted} ${code}`;
}

/**
 * Short noun form of the currency, e.g. "$JMD". Used when there's no amount,
 * like "your $JMD balance".
 */
function currencyDisplay(config) {
  const b = _branding(config);
  return `${b.currencySymbol ?? '$'}${b.currencyCode ?? 'JMD'}`;
}

/**
 * Bot's display name (used in embed titles, footers).
 */
function botName(config) {
  const b = _branding(config);
  return b.botName ?? 'Discord Bot';
}

/**
 * Returns the guild this bot is supposed to operate on.
 * If GUILD_ID is set in the environment, looks it up; otherwise falls back
 * to the first guild in cache (legacy single-guild behavior).
 */
function getPrimaryGuild(client) {
  if (!client || !client.guilds || !client.guilds.cache) return null;
  const id = process.env.GUILD_ID;
  if (id) {
    const guild = client.guilds.cache.get(id);
    if (guild) return guild;
  }
  return client.guilds.cache.first();
}

module.exports = {
  ensureRole,
  formatMessage,
  formatCurrency,
  currencyDisplay,
  botName,
  getPrimaryGuild
};
