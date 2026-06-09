// tempPunishments.js
// Temporary punishment system for Dimandem Bot

const { promisifyDB, DatabaseError } = require('./errorHandler');
const { logWithTimestamp, errorWithTimestamp } = require('./logger');

class TempPunishmentManager {
  constructor(client, db, auditLogger = null) {
    this.client = client;
    this.db = promisifyDB(db);
    this.auditLogger = auditLogger;
    this.activeTimers = new Map(); // Track active punishment timers

    this.initDatabase();
    this.startExpirationChecker();
  }

  // Initialize temp punishments database table
  async initDatabase() {
    try {
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS temp_punishments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          moderator_id TEXT NOT NULL,
          punishment_type TEXT NOT NULL, -- 'tempban', 'tempmute', 'tempkick'
          reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          removed_at DATETIME,
          removed_by TEXT,
          removal_reason TEXT
        )
      `);

      // Create indexes
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_temp_punishment_expires ON temp_punishments(expires_at)');
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_temp_punishment_user ON temp_punishments(user_id, guild_id)');
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_temp_punishment_active ON temp_punishments(is_active)');

      logWithTimestamp('Temporary punishment system initialized');

      // Restore active punishments on startup
      await this.restoreActivePunishments();

    } catch (error) {
      errorWithTimestamp('Failed to initialize temp punishment system:', error);
      throw error;
    }
  }

  // Start periodic expiration checker
  startExpirationChecker() {
    // Check every minute for expired punishments
    setInterval(() => {
      this.processExpiredPunishments();
    }, 60000);

    logWithTimestamp('Temporary punishment expiration checker started');
  }

  // Apply temporary ban
  async tempBan(guild, target, moderator, duration, reason = 'No reason provided') {
    try {
      const expiresAt = new Date(Date.now() + duration);

      // Ban the user
      await guild.members.ban(target, { reason: `TEMPBAN: ${reason}` });

      // Record in database
      const result = await this.db.run(`
        INSERT INTO temp_punishments (
          guild_id, user_id, moderator_id, punishment_type,
          reason, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [guild.id, target.id, moderator.id, 'tempban', reason, expiresAt.toISOString()]);

      // Set expiration timer
      this.setExpirationTimer(result.lastID, duration);

      // Log audit
      if (this.auditLogger) {
        await this.auditLogger.logAction({
          guildId: guild.id,
          actionType: 'tempban',
          moderator,
          target,
          reason,
          expiresAt: expiresAt.toISOString()
        });
      }

      logWithTimestamp(`Applied temporary ban: ${target.user?.username || target.username} for ${this.formatDuration(duration)}`);

      return {
        id: result.lastID,
        expiresAt,
        duration: this.formatDuration(duration)
      };

    } catch (error) {
      errorWithTimestamp('Failed to apply temporary ban:', error);
      throw error;
    }
  }

  // Apply temporary mute
  async tempMute(guild, target, moderator, duration, reason = 'No reason provided') {
    try {
      const expiresAt = new Date(Date.now() + duration);

      // Apply timeout (Discord's built-in mute)
      await target.timeout(duration, `TEMPMUTE: ${reason}`);

      // Record in database
      const result = await this.db.run(`
        INSERT INTO temp_punishments (
          guild_id, user_id, moderator_id, punishment_type,
          reason, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [guild.id, target.id, moderator.id, 'tempmute', reason, expiresAt.toISOString()]);

      // Set expiration timer
      this.setExpirationTimer(result.lastID, duration);

      // Log audit
      if (this.auditLogger) {
        await this.auditLogger.logAction({
          guildId: guild.id,
          actionType: 'tempmute',
          moderator,
          target,
          reason,
          expiresAt: expiresAt.toISOString()
        });
      }

      logWithTimestamp(`Applied temporary mute: ${target.user?.username || target.username} for ${this.formatDuration(duration)}`);

      return {
        id: result.lastID,
        expiresAt,
        duration: this.formatDuration(duration)
      };

    } catch (error) {
      errorWithTimestamp('Failed to apply temporary mute:', error);
      throw error;
    }
  }

  // Set expiration timer
  setExpirationTimer(punishmentId, duration) {
    // Don't set timer for durations longer than 24 hours (use periodic checker instead)
    if (duration > 24 * 60 * 60 * 1000) {
      return;
    }

    const timer = setTimeout(async () => {
      await this.expirePunishment(punishmentId);
      this.activeTimers.delete(punishmentId);
    }, duration);

    this.activeTimers.set(punishmentId, timer);
  }

  // Expire a specific punishment
  async expirePunishment(punishmentId) {
    try {
      // Get punishment details
      const punishment = await this.db.get(`
        SELECT * FROM temp_punishments
        WHERE id = ? AND is_active = 1
      `, [punishmentId]);

      if (!punishment) {
        return; // Already expired or doesn't exist
      }

      const guild = this.client.guilds.cache.get(punishment.guild_id);
      if (!guild) {
        logWithTimestamp(`Guild not found for punishment ${punishmentId}`);
        return;
      }

      // Handle expiration based on punishment type
      switch (punishment.punishment_type) {
        case 'tempban':
          await this.expireTempBan(guild, punishment);
          break;
        case 'tempmute':
          await this.expireTempMute(guild, punishment);
          break;
        default:
          logWithTimestamp(`Unknown punishment type: ${punishment.punishment_type}`);
      }

      // Mark as expired in database
      await this.db.run(`
        UPDATE temp_punishments
        SET is_active = 0, removed_at = CURRENT_TIMESTAMP, removal_reason = 'Expired'
        WHERE id = ?
      `, [punishmentId]);

      logWithTimestamp(`Expired punishment ${punishmentId} (${punishment.punishment_type})`);

    } catch (error) {
      errorWithTimestamp(`Failed to expire punishment ${punishmentId}:`, error);
    }
  }

  // Expire temporary ban
  async expireTempBan(guild, punishment) {
    try {
      await guild.members.unban(punishment.user_id, 'Temporary ban expired');

      // Log audit
      if (this.auditLogger) {
        await this.auditLogger.logAction({
          guildId: guild.id,
          actionType: 'unban',
          moderator: { id: 'SYSTEM', username: 'System' },
          target: { id: punishment.user_id, username: 'Unknown User' },
          reason: 'Temporary ban expired'
        });
      }

    } catch (error) {
      // User might not be banned anymore, that's okay
      logWithTimestamp(`Could not unban user ${punishment.user_id}: ${error.message}`);
    }
  }

  // Expire temporary mute
  async expireTempMute(guild, punishment) {
    try {
      const member = await guild.members.fetch(punishment.user_id);
      if (member && member.isCommunicationDisabled()) {
        await member.timeout(null, 'Temporary mute expired');
      }

      // Log audit
      if (this.auditLogger) {
        await this.auditLogger.logAction({
          guildId: guild.id,
          actionType: 'unmute',
          moderator: { id: 'SYSTEM', username: 'System' },
          target: { id: punishment.user_id, username: member?.user?.username || 'Unknown User' },
          reason: 'Temporary mute expired'
        });
      }

    } catch (error) {
      // User might have left or timeout already removed
      logWithTimestamp(`Could not unmute user ${punishment.user_id}: ${error.message}`);
    }
  }

  // Process all expired punishments
  async processExpiredPunishments() {
    try {
      const expiredPunishments = await this.db.all(`
        SELECT id FROM temp_punishments
        WHERE is_active = 1 AND datetime(expires_at) <= datetime('now')
      `);

      for (const punishment of expiredPunishments) {
        await this.expirePunishment(punishment.id);
      }

      if (expiredPunishments.length > 0) {
        logWithTimestamp(`Processed ${expiredPunishments.length} expired punishments`);
      }

    } catch (error) {
      errorWithTimestamp('Failed to process expired punishments:', error);
    }
  }

  // Restore active punishments on startup
  async restoreActivePunishments() {
    try {
      const activePunishments = await this.db.all(`
        SELECT * FROM temp_punishments
        WHERE is_active = 1 AND datetime(expires_at) > datetime('now')
      `);

      for (const punishment of activePunishments) {
        const expiresAt = new Date(punishment.expires_at);
        const remainingTime = expiresAt.getTime() - Date.now();

        if (remainingTime > 0) {
          this.setExpirationTimer(punishment.id, remainingTime);
        }
      }

      logWithTimestamp(`Restored ${activePunishments.length} active punishments`);

    } catch (error) {
      errorWithTimestamp('Failed to restore active punishments:', error);
    }
  }

  // Manually remove punishment (early removal)
  async removePunishment(punishmentId, removedBy, reason = 'Manually removed') {
    try {
      // Get punishment details
      const punishment = await this.db.get(`
        SELECT * FROM temp_punishments
        WHERE id = ? AND is_active = 1
      `, [punishmentId]);

      if (!punishment) {
        throw new Error('Punishment not found or already removed');
      }

      const guild = this.client.guilds.cache.get(punishment.guild_id);
      if (!guild) {
        throw new Error('Guild not found');
      }

      // Remove the punishment
      switch (punishment.punishment_type) {
        case 'tempban':
          await guild.members.unban(punishment.user_id, reason);
          break;
        case 'tempmute':
          const member = await guild.members.fetch(punishment.user_id);
          if (member && member.isCommunicationDisabled()) {
            await member.timeout(null, reason);
          }
          break;
      }

      // Clear timer if exists
      if (this.activeTimers.has(punishmentId)) {
        clearTimeout(this.activeTimers.get(punishmentId));
        this.activeTimers.delete(punishmentId);
      }

      // Update database
      await this.db.run(`
        UPDATE temp_punishments
        SET is_active = 0, removed_at = CURRENT_TIMESTAMP,
            removed_by = ?, removal_reason = ?
        WHERE id = ?
      `, [removedBy, reason, punishmentId]);

      logWithTimestamp(`Manually removed punishment ${punishmentId}`);

      return true;

    } catch (error) {
      errorWithTimestamp('Failed to remove punishment:', error);
      throw error;
    }
  }

  // Get active punishments for a user
  async getUserPunishments(userId, guildId = null) {
    try {
      let query = `
        SELECT * FROM temp_punishments
        WHERE user_id = ? AND is_active = 1
      `;
      let params = [userId];

      if (guildId) {
        query += ' AND guild_id = ?';
        params.push(guildId);
      }

      query += ' ORDER BY created_at DESC';

      const punishments = await this.db.all(query, params);

      return punishments.map(p => ({
        id: p.id,
        type: p.punishment_type,
        reason: p.reason,
        createdAt: new Date(p.created_at),
        expiresAt: new Date(p.expires_at),
        remainingTime: new Date(p.expires_at).getTime() - Date.now(),
        guildId: p.guild_id
      }));

    } catch (error) {
      errorWithTimestamp('Failed to get user punishments:', error);
      throw error;
    }
  }

  // Get all active punishments for a guild
  async getGuildPunishments(guildId) {
    try {
      const punishments = await this.db.all(`
        SELECT * FROM temp_punishments
        WHERE guild_id = ? AND is_active = 1
        ORDER BY expires_at ASC
      `, [guildId]);

      return punishments.map(p => ({
        id: p.id,
        userId: p.user_id,
        moderatorId: p.moderator_id,
        type: p.punishment_type,
        reason: p.reason,
        createdAt: new Date(p.created_at),
        expiresAt: new Date(p.expires_at),
        remainingTime: new Date(p.expires_at).getTime() - Date.now()
      }));

    } catch (error) {
      errorWithTimestamp('Failed to get guild punishments:', error);
      throw error;
    }
  }

  // Format duration in human-readable format
  formatDuration(ms) {
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

  // Parse duration string to milliseconds
  parseDuration(durationStr) {
    const regex = /^(\d+)([smhd])$/;
    const match = durationStr.toLowerCase().match(regex);

    if (!match) {
      throw new Error('Invalid duration format. Use: 30s, 5m, 2h, 1d');
    }

    const [, amount, unit] = match;
    const num = parseInt(amount);

    const multipliers = {
      s: 1000,           // seconds
      m: 60 * 1000,      // minutes
      h: 60 * 60 * 1000, // hours
      d: 24 * 60 * 60 * 1000 // days
    };

    return num * multipliers[unit];
  }

  // Get punishment statistics
  async getStats(guildId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await this.db.get(`
        SELECT
          COUNT(*) as total_punishments,
          SUM(CASE WHEN punishment_type = 'tempban' THEN 1 ELSE 0 END) as tempbans,
          SUM(CASE WHEN punishment_type = 'tempmute' THEN 1 ELSE 0 END) as tempmutes,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_punishments,
          SUM(CASE WHEN removal_reason = 'Expired' THEN 1 ELSE 0 END) as expired_naturally,
          SUM(CASE WHEN removal_reason != 'Expired' AND removal_reason IS NOT NULL THEN 1 ELSE 0 END) as removed_early
        FROM temp_punishments
        WHERE guild_id = ? AND datetime(created_at) >= datetime(?)
      `, [guildId, startDate.toISOString()]);

      return {
        period: `${days} days`,
        ...stats
      };

    } catch (error) {
      errorWithTimestamp('Failed to get punishment stats:', error);
      throw error;
    }
  }

  // Clean up old punishment records
  async cleanup(maxAge = 90) { // 90 days default
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);

      const result = await this.db.run(`
        DELETE FROM temp_punishments
        WHERE is_active = 0 AND datetime(created_at) < datetime(?)
      `, [cutoffDate.toISOString()]);

      if (result.changes > 0) {
        logWithTimestamp(`Cleaned up ${result.changes} old punishment records`);
      }

      return result.changes;
    } catch (error) {
      errorWithTimestamp('Failed to cleanup punishment records:', error);
      throw error;
    }
  }
}

module.exports = { TempPunishmentManager };