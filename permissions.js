// permissions.js
// Permission system for Dimandem Bot

const { PermissionsBitField } = require('discord.js');
const { PermissionError } = require('./errorHandler');
const { logWithTimestamp } = require('./logger');

class PermissionManager {
  constructor() {
    // Define command permission requirements
    this.commandPermissions = {
      // Moderation commands - require specific permissions
      ban: [PermissionsBitField.Flags.BanMembers],
      kick: [PermissionsBitField.Flags.KickMembers],
      clear: [PermissionsBitField.Flags.ManageMessages],
      mute: [PermissionsBitField.Flags.ModerateMembers],
      unmute: [PermissionsBitField.Flags.ModerateMembers],
      slowmode: [PermissionsBitField.Flags.ManageChannels],
      tempban: [PermissionsBitField.Flags.BanMembers],
      tempmute: [PermissionsBitField.Flags.ModerateMembers],

      // Admin commands - require administrator
      addxp: [PermissionsBitField.Flags.Administrator],
      removexp: [PermissionsBitField.Flags.Administrator],
      backup: [PermissionsBitField.Flags.Administrator],
      restore: [PermissionsBitField.Flags.Administrator],

      // Staff commands - require manage server or specific roles
      warn: [PermissionsBitField.Flags.ManageGuild],
      purge: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ManageGuild]
    };

    // Define role-based permissions (role names that can use certain commands)
    this.rolePermissions = {
      moderator: ['warn', 'mute', 'unmute', 'clear'],
      admin: ['ban', 'kick', 'tempban', 'tempmute', 'addxp', 'removexp'],
      owner: ['backup', 'restore', 'purge']
    };

    // Bot owner ID (should be set from config or environment)
    this.ownerId = process.env.BOT_OWNER_ID;
  }

  // Check if user has required Discord permissions
  hasDiscordPermission(member, permissions, channel = null) {
    if (!member || !permissions) return false;

    // Bot owner bypasses all permission checks
    if (this.ownerId && member.id === this.ownerId) {
      return true;
    }

    const memberPermissions = channel ? member.permissionsIn(channel) : member.permissions;

    // Check if user has Administrator permission (bypasses most checks)
    if (memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
      return true;
    }

    // Check specific permissions
    return permissions.every(permission => memberPermissions.has(permission));
  }

  // Check if user has required role
  hasRole(member, roleNames) {
    if (!member || !roleNames) return false;

    // Bot owner bypasses role checks
    if (this.ownerId && member.id === this.ownerId) {
      return true;
    }

    const userRoles = member.roles.cache.map(role => role.name.toLowerCase());

    return roleNames.some(roleName =>
      userRoles.includes(roleName.toLowerCase())
    );
  }

  // Check if user can use a specific command
  canUseCommand(member, commandName, channel = null) {
    if (!member) return false;

    // Bot owner can use any command
    if (this.ownerId && member.id === this.ownerId) {
      return true;
    }

    const commandLower = commandName.toLowerCase();

    // Check Discord permissions
    if (this.commandPermissions[commandLower]) {
      if (this.hasDiscordPermission(member, this.commandPermissions[commandLower], channel)) {
        return true;
      }
    }

    // Check role-based permissions
    for (const [roleName, commands] of Object.entries(this.rolePermissions)) {
      if (commands.includes(commandLower) && this.hasRole(member, [roleName])) {
        return true;
      }
    }

    // If command has no specific requirements, allow usage
    if (!this.commandPermissions[commandLower]) {
      return true;
    }

    return false;
  }

  // Validate permissions for a command and throw error if insufficient
  validateCommand(member, commandName, channel = null) {
    if (!this.canUseCommand(member, commandName, channel)) {
      const requiredPerms = this.commandPermissions[commandName.toLowerCase()];
      const requiredRoles = Object.entries(this.rolePermissions)
        .filter(([role, commands]) => commands.includes(commandName.toLowerCase()))
        .map(([role]) => role);

      let errorMessage = `You don't have permission to use \`${commandName}\`.`;

      if (requiredPerms || requiredRoles.length > 0) {
        errorMessage += '\n\n**Required:**';

        if (requiredPerms) {
          const permNames = requiredPerms.map(perm =>
            Object.keys(PermissionsBitField.Flags).find(key =>
              PermissionsBitField.Flags[key] === perm
            )
          );
          errorMessage += `\n• Discord Permissions: ${permNames.join(', ')}`;
        }

        if (requiredRoles.length > 0) {
          errorMessage += `\n• Roles: ${requiredRoles.join(', ')}`;
        }
      }

      throw new PermissionError(errorMessage, requiredPerms || requiredRoles);
    }

    return true;
  }

  // Check if bot has required permissions in a channel
  botHasPermission(botMember, permissions, channel = null) {
    if (!botMember || !permissions) return false;

    const botPermissions = channel ? botMember.permissionsIn(channel) : botMember.permissions;

    return permissions.every(permission => botPermissions.has(permission));
  }

  // Validate bot permissions and throw error if insufficient
  validateBotPermissions(botMember, permissions, channel = null, action = 'perform this action') {
    if (!this.botHasPermission(botMember, permissions, channel)) {
      const permNames = permissions.map(perm =>
        Object.keys(PermissionsBitField.Flags).find(key =>
          PermissionsBitField.Flags[key] === perm
        )
      );

      throw new PermissionError(
        `I don't have the required permissions to ${action}.\n\n**Required Permissions:**\n• ${permNames.join('\n• ')}`,
        permissions
      );
    }

    return true;
  }

  // Check if target user can be moderated by the command user
  canModerate(moderator, target, channel = null) {
    if (!moderator || !target) return false;

    // Can't moderate yourself
    if (moderator.id === target.id) {
      throw new PermissionError("You cannot moderate yourself.");
    }

    // Can't moderate bots (except with specific permission)
    if (target.user.bot && !this.hasDiscordPermission(moderator, [PermissionsBitField.Flags.Administrator])) {
      throw new PermissionError("You cannot moderate bots.");
    }

    // Can't moderate server owner
    if (target.id === target.guild.ownerId) {
      throw new PermissionError("You cannot moderate the server owner.");
    }

    // Can't moderate users with higher roles
    if (moderator.roles.highest.position <= target.roles.highest.position) {
      throw new PermissionError("You cannot moderate someone with equal or higher roles.");
    }

    return true;
  }

  // Check if bot can moderate target
  botCanModerate(botMember, target) {
    if (!botMember || !target) return false;

    // Can't moderate server owner
    if (target.id === target.guild.ownerId) {
      throw new PermissionError("I cannot moderate the server owner.");
    }

    // Can't moderate users with higher roles than bot
    if (botMember.roles.highest.position <= target.roles.highest.position) {
      throw new PermissionError("I cannot moderate someone with equal or higher roles than me.");
    }

    return true;
  }

  // Log permission check
  logPermissionCheck(userId, commandName, granted, reason = null) {
    const status = granted ? 'GRANTED' : 'DENIED';
    logWithTimestamp(`Permission ${status} - User: ${userId}, Command: ${commandName}${reason ? `, Reason: ${reason}` : ''}`);
  }

  // Get user's effective permissions
  getUserPermissions(member, channel = null) {
    if (!member) return [];

    const permissions = channel ? member.permissionsIn(channel) : member.permissions;
    const userRoles = member.roles.cache.map(role => role.name);

    return {
      discordPermissions: Object.keys(PermissionsBitField.Flags).filter(flag =>
        permissions.has(PermissionsBitField.Flags[flag])
      ),
      roles: userRoles,
      isOwner: this.ownerId && member.id === this.ownerId,
      isAdmin: permissions.has(PermissionsBitField.Flags.Administrator)
    };
  }

  // Add custom permission check
  addCustomPermission(commandName, checkFunction) {
    if (typeof checkFunction !== 'function') {
      throw new Error('Permission check must be a function');
    }

    // Store custom permission check
    this.customPermissions = this.customPermissions || {};
    this.customPermissions[commandName.toLowerCase()] = checkFunction;
  }

  // Check custom permissions
  checkCustomPermission(member, commandName, ...args) {
    const customCheck = this.customPermissions?.[commandName.toLowerCase()];
    if (customCheck) {
      return customCheck(member, ...args);
    }
    return true;
  }
}

module.exports = { PermissionManager };