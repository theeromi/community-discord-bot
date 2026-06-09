// commands/bulk.js
// Bulk moderation tools for Dimandem Bot

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { Validator } = require('../validation');
const { PermissionManager } = require('../permissions');
const { AuditLogger } = require('../auditLogger');

module.exports = {
  name: 'bulk',
  description: 'Bulk moderation operations',
  permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers],
  aliases: ['bulkmod', 'mass'],
  rateLimit: { limit: 3, window: 300000 }, // 3 uses per 5 minutes

  async execute(message, args, db, EmbedBuilder) {
    const permissionManager = new PermissionManager();
    const auditLogger = new AuditLogger(db);

    // Validate permissions
    permissionManager.validateCommand(message.member, 'bulk', message.channel);
    permissionManager.validateBotPermissions(
      message.guild.members.me,
      [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers],
      message.channel,
      'perform bulk moderation'
    );

    if (args.length < 1) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Bulk Moderation')
          .setDescription('**Usage:**\n' +
            '`!bulk purge <count> [reason]` - Delete multiple messages\n' +
            '`!bulk kick <@user1> <@user2> ... [reason]` - Kick multiple users\n' +
            '`!bulk ban <@user1> <@user2> ... [reason]` - Ban multiple users\n' +
            '`!bulk mute <@user1> <@user2> ... <duration> [reason]` - Mute multiple users\n' +
            '`!bulk unmute <@user1> <@user2> ... [reason]` - Unmute multiple users\n' +
            '`!bulk role add <@role> <@user1> <@user2> ...` - Add role to multiple users\n' +
            '`!bulk role remove <@role> <@user1> <@user2> ...` - Remove role from multiple users')
          .setColor(0xff6b6b)
        ]
      });
    }

    const operation = args[0].toLowerCase();

    try {
      switch (operation) {
        case 'purge':
          await handleBulkPurge(message, args.slice(1), auditLogger);
          break;
        case 'kick':
          await handleBulkKick(message, args.slice(1), permissionManager, auditLogger);
          break;
        case 'ban':
          await handleBulkBan(message, args.slice(1), permissionManager, auditLogger);
          break;
        case 'mute':
          await handleBulkMute(message, args.slice(1), permissionManager, auditLogger);
          break;
        case 'unmute':
          await handleBulkUnmute(message, args.slice(1), permissionManager, auditLogger);
          break;
        case 'role':
          await handleBulkRole(message, args.slice(1), permissionManager, auditLogger);
          break;
        default:
          return message.reply('❌ Unknown bulk operation. Use `!bulk` to see available commands.');
      }
    } catch (error) {
      throw error; // Let enhanced error handler deal with it
    }
  }
};

// Bulk message deletion
async function handleBulkPurge(message, args, auditLogger) {
  if (args.length < 1) {
    throw new Error('Please specify the number of messages to delete (1-100).');
  }

  const count = Validator.validateMessageCount(args[0]);
  const reason = args.slice(1).join(' ') || 'Bulk purge';

  // Delete messages
  const deleted = await message.channel.bulkDelete(count, true);

  // Send confirmation
  const confirmMessage = await message.channel.send({
    embeds: [new EmbedBuilder()
      .setTitle('✅ Bulk Purge Completed')
      .setDescription(`Successfully deleted ${deleted.size} messages.`)
      .setColor(0x4caf50)
      .setFooter({ text: `Reason: ${reason}` })
    ]
  });

  // Auto-delete confirmation after 5 seconds
  setTimeout(() => confirmMessage.delete().catch(() => {}), 5000);

  // Log audit
  await auditLogger.logClear(message.guild, message.member, message.channel.id, deleted.size, reason);
}

// Bulk kick users
async function handleBulkKick(message, args, permissionManager, auditLogger) {
  if (args.length < 1) {
    throw new Error('Please mention at least one user to kick.');
  }

  const { users, reason } = parseUsersAndReason(args, message);

  if (users.length === 0) {
    throw new Error('No valid users found to kick.');
  }

  if (users.length > 10) {
    throw new Error('Cannot kick more than 10 users at once for safety.');
  }

  const results = {
    successful: [],
    failed: []
  };

  for (const user of users) {
    try {
      // Validate moderation permissions
      permissionManager.canModerate(message.member, user);
      permissionManager.botCanModerate(message.guild.members.me, user);

      await user.kick(reason);
      results.successful.push(user);

      // Log individual kick
      await auditLogger.logKick(message.guild, message.member, user, reason);

    } catch (error) {
      results.failed.push({ user, error: error.message });
    }
  }

  // Send results
  await sendBulkResults(message, 'Kick', results, reason);
}

// Bulk ban users
async function handleBulkBan(message, args, permissionManager, auditLogger) {
  if (args.length < 1) {
    throw new Error('Please mention at least one user to ban.');
  }

  const { users, reason } = parseUsersAndReason(args, message);

  if (users.length === 0) {
    throw new Error('No valid users found to ban.');
  }

  if (users.length > 10) {
    throw new Error('Cannot ban more than 10 users at once for safety.');
  }

  const results = {
    successful: [],
    failed: []
  };

  for (const user of users) {
    try {
      // Validate moderation permissions
      permissionManager.canModerate(message.member, user);
      permissionManager.botCanModerate(message.guild.members.me, user);

      await message.guild.members.ban(user, { reason });
      results.successful.push(user);

      // Log individual ban
      await auditLogger.logBan(message.guild, message.member, user, reason);

    } catch (error) {
      results.failed.push({ user, error: error.message });
    }
  }

  // Send results
  await sendBulkResults(message, 'Ban', results, reason);
}

// Bulk mute users
async function handleBulkMute(message, args, permissionManager, auditLogger) {
  if (args.length < 2) {
    throw new Error('Please mention users and specify duration (e.g., `!bulk mute @user1 @user2 1h reason`).');
  }

  // Find duration in args (format: 1h, 30m, etc.)
  const durationIndex = args.findIndex(arg => /^\d+[smhd]$/.test(arg));
  if (durationIndex === -1) {
    throw new Error('Please specify a duration (e.g., 30m, 1h, 2d).');
  }

  const duration = Validator.validateDuration(args[durationIndex]);
  const userArgs = args.slice(0, durationIndex);
  const reasonArgs = args.slice(durationIndex + 1);
  const reason = reasonArgs.join(' ') || 'Bulk mute';

  const users = parseUserMentions(userArgs, message);

  if (users.length === 0) {
    throw new Error('No valid users found to mute.');
  }

  if (users.length > 10) {
    throw new Error('Cannot mute more than 10 users at once for safety.');
  }

  const results = {
    successful: [],
    failed: []
  };

  const expiresAt = new Date(Date.now() + duration);

  for (const user of users) {
    try {
      // Validate moderation permissions
      permissionManager.canModerate(message.member, user);
      permissionManager.botCanModerate(message.guild.members.me, user);

      await user.timeout(duration, reason);
      results.successful.push(user);

      // Log individual mute
      await auditLogger.logMute(message.guild, message.member, user, reason, expiresAt.toISOString());

    } catch (error) {
      results.failed.push({ user, error: error.message });
    }
  }

  // Send results
  await sendBulkResults(message, 'Mute', results, reason, { duration: formatDuration(duration) });
}

// Bulk unmute users
async function handleBulkUnmute(message, args, permissionManager, auditLogger) {
  if (args.length < 1) {
    throw new Error('Please mention at least one user to unmute.');
  }

  const { users, reason } = parseUsersAndReason(args, message);

  if (users.length === 0) {
    throw new Error('No valid users found to unmute.');
  }

  if (users.length > 10) {
    throw new Error('Cannot unmute more than 10 users at once for safety.');
  }

  const results = {
    successful: [],
    failed: []
  };

  for (const user of users) {
    try {
      if (!user.isCommunicationDisabled()) {
        results.failed.push({ user, error: 'User is not muted' });
        continue;
      }

      await user.timeout(null, reason);
      results.successful.push(user);

      // Log unmute
      await auditLogger.logAction({
        guildId: message.guild.id,
        actionType: 'unmute',
        moderator: message.member,
        target: user,
        reason
      });

    } catch (error) {
      results.failed.push({ user, error: error.message });
    }
  }

  // Send results
  await sendBulkResults(message, 'Unmute', results, reason);
}

// Bulk role operations
async function handleBulkRole(message, args, permissionManager, auditLogger) {
  if (args.length < 3) {
    throw new Error('Usage: `!bulk role <add|remove> <@role> <@user1> <@user2> ...`');
  }

  const action = args[0].toLowerCase();
  if (!['add', 'remove'].includes(action)) {
    throw new Error('Role action must be either "add" or "remove".');
  }

  const role = Validator.validateRole(args[1], message);
  const users = parseUserMentions(args.slice(2), message);

  if (users.length === 0) {
    throw new Error('No valid users found for role operation.');
  }

  if (users.length > 20) {
    throw new Error('Cannot modify roles for more than 20 users at once for safety.');
  }

  // Check if bot can manage the role
  if (role.position >= message.guild.members.me.roles.highest.position) {
    throw new Error('I cannot manage that role as it is higher than or equal to my highest role.');
  }

  // Check if user can manage the role
  if (role.position >= message.member.roles.highest.position && message.member.id !== message.guild.ownerId) {
    throw new Error('You cannot manage that role as it is higher than or equal to your highest role.');
  }

  const results = {
    successful: [],
    failed: []
  };

  for (const user of users) {
    try {
      if (action === 'add') {
        if (user.roles.cache.has(role.id)) {
          results.failed.push({ user, error: 'User already has this role' });
          continue;
        }
        await user.roles.add(role);
      } else {
        if (!user.roles.cache.has(role.id)) {
          results.failed.push({ user, error: 'User does not have this role' });
          continue;
        }
        await user.roles.remove(role);
      }

      results.successful.push(user);

      // Log role change
      await auditLogger.logAction({
        guildId: message.guild.id,
        actionType: action === 'add' ? 'role_add' : 'role_remove',
        moderator: message.member,
        target: user,
        reason: `Bulk role ${action}: ${role.name}`
      });

    } catch (error) {
      results.failed.push({ user, error: error.message });
    }
  }

  // Send results
  await sendBulkResults(message, `Role ${action}`, results, `${role.name} role ${action}`, { role: role.name });
}

// Helper function to parse user mentions and reason
function parseUsersAndReason(args, message) {
  const userArgs = [];
  const reasonArgs = [];
  let foundNonUser = false;

  for (const arg of args) {
    if (!foundNonUser && (arg.startsWith('<@') || /^\d{17,19}$/.test(arg))) {
      userArgs.push(arg);
    } else {
      foundNonUser = true;
      reasonArgs.push(arg);
    }
  }

  const users = parseUserMentions(userArgs, message);
  const reason = reasonArgs.join(' ') || 'No reason provided';

  return { users, reason };
}

// Helper function to parse user mentions
function parseUserMentions(args, message) {
  const users = [];

  for (const arg of args) {
    try {
      const user = Validator.validateUser(arg, message, true); // Allow self for some operations
      users.push(user);
    } catch (error) {
      // Skip invalid users, they'll be reported in the results
    }
  }

  return users;
}

// Helper function to send bulk operation results
async function sendBulkResults(message, operation, results, reason, extraInfo = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`${results.successful.length > 0 ? '✅' : '❌'} Bulk ${operation} Results`)
    .setColor(results.successful.length > 0 ? 0x4caf50 : 0xff6b6b)
    .setFooter({ text: `Reason: ${reason}` });

  let description = '';

  if (results.successful.length > 0) {
    description += `**✅ Successful (${results.successful.length}):**\n`;
    description += results.successful.map(user => `• ${user.user?.username || user.username}`).join('\n');
    description += '\n\n';
  }

  if (results.failed.length > 0) {
    description += `**❌ Failed (${results.failed.length}):**\n`;
    description += results.failed.map(f => `• ${f.user.user?.username || f.user.username}: ${f.error}`).join('\n');
  }

  if (extraInfo.duration) {
    description += `\n\n**Duration:** ${extraInfo.duration}`;
  }

  if (extraInfo.role) {
    description += `\n\n**Role:** ${extraInfo.role}`;
  }

  embed.setDescription(description.slice(0, 4096)); // Discord embed limit

  await message.reply({ embeds: [embed] });
}

// Helper function to format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}