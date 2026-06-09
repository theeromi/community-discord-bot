// validation.js
// Input validation system for Dimandem Bot

const { ValidationError } = require('./errorHandler');

class Validator {

  // Validate Discord user mention or ID
  static validateUser(input, message, allowSelf = false) {
    if (!input) {
      throw new ValidationError('User is required', 'user', input);
    }

    let userId;

    // Extract user ID from mention or use raw ID
    if (input.startsWith('<@') && input.endsWith('>')) {
      userId = input.slice(2, -1);
      if (userId.startsWith('!')) userId = userId.slice(1);
    } else if (/^\d{17,19}$/.test(input)) {
      userId = input;
    } else {
      throw new ValidationError('Invalid user format. Use @user or user ID', 'user', input);
    }

    const user = message.guild.members.cache.get(userId);
    if (!user) {
      throw new ValidationError('User not found in this server', 'user', userId);
    }

    if (!allowSelf && user.id === message.author.id) {
      throw new ValidationError('You cannot target yourself', 'user', userId);
    }

    if (user.user.bot) {
      throw new ValidationError('Cannot target bots', 'user', userId);
    }

    return user;
  }

  // Validate XP amount
  static validateXP(input) {
    if (!input) {
      throw new ValidationError('XP amount is required', 'xp', input);
    }

    const xp = parseInt(input);
    if (isNaN(xp)) {
      throw new ValidationError('XP must be a number', 'xp', input);
    }

    if (xp < 1 || xp > 10000) {
      throw new ValidationError('XP must be between 1 and 10,000', 'xp', xp);
    }

    return xp;
  }

  // Validate birthday date
  static validateBirthday(input) {
    if (!input) {
      throw new ValidationError('Birthday is required in YYYY-MM-DD format', 'birthday', input);
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(input)) {
      throw new ValidationError('Birthday must be in YYYY-MM-DD format (e.g., 2000-05-21)', 'birthday', input);
    }

    const date = new Date(input);
    if (isNaN(date.getTime())) {
      throw new ValidationError('Invalid date', 'birthday', input);
    }

    const now = new Date();
    const minDate = new Date(now.getFullYear() - 120, 0, 1);
    const maxDate = new Date(now.getFullYear() - 13, 11, 31);

    if (date < minDate || date > maxDate) {
      throw new ValidationError('Birthday must be within reasonable range (13-120 years old)', 'birthday', input);
    }

    return input;
  }

  // Validate message count for clear command
  static validateMessageCount(input) {
    if (!input) {
      throw new ValidationError('Number of messages is required', 'count', input);
    }

    const count = parseInt(input);
    if (isNaN(count)) {
      throw new ValidationError('Message count must be a number', 'count', input);
    }

    if (count < 1 || count > 100) {
      throw new ValidationError('Message count must be between 1 and 100', 'count', count);
    }

    return count;
  }

  // Validate slowmode duration
  static validateSlowmode(input) {
    if (!input) {
      throw new ValidationError('Slowmode duration is required', 'duration', input);
    }

    const duration = parseInt(input);
    if (isNaN(duration)) {
      throw new ValidationError('Duration must be a number of seconds', 'duration', input);
    }

    if (duration < 0 || duration > 21600) { // Max 6 hours
      throw new ValidationError('Duration must be between 0 and 21600 seconds (6 hours)', 'duration', duration);
    }

    return duration;
  }

  // Validate ban/kick reason
  static validateReason(input, required = false) {
    if (required && !input) {
      throw new ValidationError('Reason is required', 'reason', input);
    }

    if (input && input.length > 512) {
      throw new ValidationError('Reason must be 512 characters or less', 'reason', input);
    }

    return input || 'No reason provided';
  }

  // Validate channel mention or name
  static validateChannel(input, message) {
    if (!input) {
      throw new ValidationError('Channel is required', 'channel', input);
    }

    let channel;

    // Extract channel ID from mention or find by name
    if (input.startsWith('<#') && input.endsWith('>')) {
      const channelId = input.slice(2, -1);
      channel = message.guild.channels.cache.get(channelId);
    } else {
      channel = message.guild.channels.cache.find(ch =>
        ch.name === input || ch.name === input.replace('#', '')
      );
    }

    if (!channel) {
      throw new ValidationError('Channel not found', 'channel', input);
    }

    if (!channel.isTextBased()) {
      throw new ValidationError('Channel must be a text channel', 'channel', input);
    }

    return channel;
  }

  // Validate role mention or name
  static validateRole(input, message) {
    if (!input) {
      throw new ValidationError('Role is required', 'role', input);
    }

    let role;

    // Extract role ID from mention or find by name
    if (input.startsWith('<@&') && input.endsWith('>')) {
      const roleId = input.slice(3, -1);
      role = message.guild.roles.cache.get(roleId);
    } else {
      role = message.guild.roles.cache.find(r =>
        r.name.toLowerCase() === input.toLowerCase()
      );
    }

    if (!role) {
      throw new ValidationError('Role not found', 'role', input);
    }

    return role;
  }

  // Validate duration for temporary punishments
  static validateDuration(input) {
    if (!input) {
      throw new ValidationError('Duration is required (e.g., 1h, 30m, 2d)', 'duration', input);
    }

    const durationRegex = /^(\d+)([smhd])$/;
    const match = input.toLowerCase().match(durationRegex);

    if (!match) {
      throw new ValidationError('Invalid duration format. Use: 30s, 5m, 2h, 1d', 'duration', input);
    }

    const [, amount, unit] = match;
    const num = parseInt(amount);

    if (num <= 0) {
      throw new ValidationError('Duration must be positive', 'duration', input);
    }

    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = num * multipliers[unit];

    // Max 30 days
    if (ms > 30 * 86400000) {
      throw new ValidationError('Duration cannot exceed 30 days', 'duration', input);
    }

    return ms;
  }

  // Validate text length
  static validateText(input, fieldName, minLength = 0, maxLength = 2000) {
    if (input && input.length < minLength) {
      throw new ValidationError(`${fieldName} must be at least ${minLength} characters`, fieldName, input);
    }

    if (input && input.length > maxLength) {
      throw new ValidationError(`${fieldName} must be ${maxLength} characters or less`, fieldName, input);
    }

    return input;
  }

  // Validate permissions
  static validatePermissions(member, requiredPermissions, channel = null) {
    const permissions = channel ? member.permissionsIn(channel) : member.permissions;

    for (const permission of requiredPermissions) {
      if (!permissions.has(permission)) {
        throw new ValidationError(
          `Missing required permission: ${permission}`,
          'permissions',
          permission
        );
      }
    }

    return true;
  }
}

module.exports = { Validator };