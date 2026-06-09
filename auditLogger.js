// auditLogger.js — audit logging system

const { EmbedBuilder } = require('discord.js');
const { promisifyDB, DatabaseError } = require('./errorHandler');
const { logWithTimestamp, errorWithTimestamp } = require('./logger');
const config = require('./config');
const { botName } = require('./utils');

class AuditLogger {
  constructor(db) {
    this.db = promisifyDB(db);
    this.initDatabase();
  }

  // Initialize audit log database table
  async initDatabase() {
    try {
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          action_type TEXT NOT NULL,
          moderator_id TEXT NOT NULL,
          moderator_name TEXT NOT NULL,
          target_id TEXT,
          target_name TEXT,
          reason TEXT,
          details TEXT,
          channel_id TEXT,
          message_id TEXT,
          expires_at TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better performance
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_guild_id ON audit_logs(guild_id)');
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit_logs(action_type)');
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)');

      logWithTimestamp('Audit logging system initialized');
    } catch (error) {
      errorWithTimestamp('Failed to initialize audit logging:', error);
      throw error;
    }
  }

  // Log a moderation action
  async logAction({
    guildId,
    actionType,
    moderator,
    target = null,
    reason = 'No reason provided',
    details = null,
    channelId = null,
    expiresAt = null
  }) {
    try {
      const timestamp = new Date().toISOString();

      const result = await this.db.run(`
        INSERT INTO audit_logs (
          timestamp, guild_id, action_type, moderator_id, moderator_name,
          target_id, target_name, reason, details, channel_id, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        timestamp,
        guildId,
        actionType,
        moderator.id,
        moderator.user?.username || moderator.username,
        target?.id || null,
        target?.user?.username || target?.username || null,
        reason,
        details ? JSON.stringify(details) : null,
        channelId,
        expiresAt
      ]);

      logWithTimestamp(`Audit log created: ${actionType} by ${moderator.user?.username || moderator.username}`);
      return result.lastID;

    } catch (error) {
      errorWithTimestamp('Failed to log audit action:', error);
      throw new DatabaseError('Failed to create audit log', 'INSERT');
    }
  }

  // Send audit log to designated channel
  async sendAuditLog(guild, logData, embedColor = 0xff9900) {
    try {
      // Find audit log channel
      const auditChannel = guild.channels.cache.find(ch =>
        ch.name === 'audit-logs' || ch.name === 'mod-logs' || ch.name === 'logs'
      );

      if (!auditChannel) {
        logWithTimestamp('No audit log channel found, skipping embed');
        return null;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔨 ${logData.actionType.toUpperCase()}`)
        .setColor(embedColor)
        .setTimestamp()
        .setFooter({ text: `${botName(config)} Audit Log` });

      // Add moderator field
      embed.addFields({
        name: '👮 Moderator',
        value: `<@${logData.moderator.id}> (${logData.moderator.user?.username || logData.moderator.username})`,
        inline: true
      });

      // Add target field if applicable
      if (logData.target) {
        embed.addFields({
          name: '🎯 Target',
          value: `<@${logData.target.id}> (${logData.target.user?.username || logData.target.username})`,
          inline: true
        });
      }

      // Add reason
      embed.addFields({
        name: '📝 Reason',
        value: logData.reason || 'No reason provided',
        inline: false
      });

      // Add additional details if provided
      if (logData.details) {
        const details = typeof logData.details === 'string' ?
          logData.details : JSON.stringify(logData.details, null, 2);

        if (details.length <= 1024) {
          embed.addFields({
            name: '📋 Details',
            value: `\`\`\`${details}\`\`\``,
            inline: false
          });
        }
      }

      // Add expiration if applicable
      if (logData.expiresAt) {
        const expiryTime = Math.floor(new Date(logData.expiresAt).getTime() / 1000);
        embed.addFields({
          name: '⏰ Expires',
          value: `<t:${expiryTime}:R>`,
          inline: true
        });
      }

      const message = await auditChannel.send({ embeds: [embed] });

      // Update audit log with message ID
      await this.db.run(
        'UPDATE audit_logs SET message_id = ? WHERE timestamp = ? AND guild_id = ? AND moderator_id = ?',
        [message.id, logData.timestamp || new Date().toISOString(), guild.id, logData.moderator.id]
      );

      return message;

    } catch (error) {
      errorWithTimestamp('Failed to send audit log embed:', error);
      return null;
    }
  }

  // Get audit logs for a user
  async getUserLogs(guildId, userId, limit = 10) {
    try {
      return await this.db.all(`
        SELECT * FROM audit_logs
        WHERE guild_id = ? AND (moderator_id = ? OR target_id = ?)
        ORDER BY created_at DESC
        LIMIT ?
      `, [guildId, userId, userId, limit]);
    } catch (error) {
      errorWithTimestamp('Failed to get user logs:', error);
      throw new DatabaseError('Failed to retrieve user audit logs', 'SELECT');
    }
  }

  // Get audit logs by action type
  async getLogsByAction(guildId, actionType, limit = 50) {
    try {
      return await this.db.all(`
        SELECT * FROM audit_logs
        WHERE guild_id = ? AND action_type = ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [guildId, actionType, limit]);
    } catch (error) {
      errorWithTimestamp('Failed to get logs by action:', error);
      throw new DatabaseError('Failed to retrieve action audit logs', 'SELECT');
    }
  }

  // Get recent audit logs
  async getRecentLogs(guildId, limit = 20) {
    try {
      return await this.db.all(`
        SELECT * FROM audit_logs
        WHERE guild_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `, [guildId, limit]);
    } catch (error) {
      errorWithTimestamp('Failed to get recent logs:', error);
      throw new DatabaseError('Failed to retrieve recent audit logs', 'SELECT');
    }
  }

  // Get audit log statistics
  async getStats(guildId, days = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const stats = await this.db.all(`
        SELECT
          action_type,
          COUNT(*) as count,
          COUNT(DISTINCT moderator_id) as unique_moderators
        FROM audit_logs
        WHERE guild_id = ? AND created_at >= ?
        GROUP BY action_type
        ORDER BY count DESC
      `, [guildId, cutoffDate.toISOString()]);

      const totalActions = await this.db.get(`
        SELECT COUNT(*) as total
        FROM audit_logs
        WHERE guild_id = ? AND created_at >= ?
      `, [guildId, cutoffDate.toISOString()]);

      return {
        period: `${days} days`,
        totalActions: totalActions.total,
        actionBreakdown: stats
      };
    } catch (error) {
      errorWithTimestamp('Failed to get audit stats:', error);
      throw new DatabaseError('Failed to retrieve audit statistics', 'SELECT');
    }
  }

  // Clean up old audit logs
  async cleanup(maxAge = 90) { // 90 days default
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);

      const result = await this.db.run(`
        DELETE FROM audit_logs
        WHERE created_at < ?
      `, [cutoffDate.toISOString()]);

      if (result.changes > 0) {
        logWithTimestamp(`Cleaned up ${result.changes} old audit log entries`);
      }

      return result.changes;
    } catch (error) {
      errorWithTimestamp('Failed to cleanup audit logs:', error);
      throw new DatabaseError('Failed to cleanup audit logs', 'DELETE');
    }
  }

  // Predefined action types for consistency
  static get ACTIONS() {
    return {
      BAN: 'ban',
      UNBAN: 'unban',
      KICK: 'kick',
      MUTE: 'mute',
      UNMUTE: 'unmute',
      WARN: 'warn',
      CLEAR: 'clear',
      SLOWMODE: 'slowmode',
      TEMPBAN: 'tempban',
      TEMPMUTE: 'tempmute',
      ADD_XP: 'add_xp',
      REMOVE_XP: 'remove_xp',
      ROLE_ADD: 'role_add',
      ROLE_REMOVE: 'role_remove',
      CHANNEL_CREATE: 'channel_create',
      CHANNEL_DELETE: 'channel_delete',
      MESSAGE_DELETE: 'message_delete',
      BULK_DELETE: 'bulk_delete'
    };
  }

  // Helper methods for common actions
  async logBan(guild, moderator, target, reason, expiresAt = null) {
    const logId = await this.logAction({
      guildId: guild.id,
      actionType: AuditLogger.ACTIONS.BAN,
      moderator,
      target,
      reason,
      expiresAt
    });

    await this.sendAuditLog(guild, {
      actionType: AuditLogger.ACTIONS.BAN,
      moderator,
      target,
      reason,
      expiresAt,
      timestamp: new Date().toISOString()
    }, 0xff0000);

    return logId;
  }

  async logKick(guild, moderator, target, reason) {
    const logId = await this.logAction({
      guildId: guild.id,
      actionType: AuditLogger.ACTIONS.KICK,
      moderator,
      target,
      reason
    });

    await this.sendAuditLog(guild, {
      actionType: AuditLogger.ACTIONS.KICK,
      moderator,
      target,
      reason,
      timestamp: new Date().toISOString()
    }, 0xff6600);

    return logId;
  }

  async logMute(guild, moderator, target, reason, expiresAt = null) {
    const logId = await this.logAction({
      guildId: guild.id,
      actionType: AuditLogger.ACTIONS.MUTE,
      moderator,
      target,
      reason,
      expiresAt
    });

    await this.sendAuditLog(guild, {
      actionType: AuditLogger.ACTIONS.MUTE,
      moderator,
      target,
      reason,
      expiresAt,
      timestamp: new Date().toISOString()
    }, 0xffaa00);

    return logId;
  }

  async logClear(guild, moderator, channelId, count, reason) {
    const logId = await this.logAction({
      guildId: guild.id,
      actionType: AuditLogger.ACTIONS.CLEAR,
      moderator,
      reason,
      details: { messageCount: count },
      channelId
    });

    await this.sendAuditLog(guild, {
      actionType: AuditLogger.ACTIONS.CLEAR,
      moderator,
      reason,
      details: `Deleted ${count} messages in <#${channelId}>`,
      timestamp: new Date().toISOString()
    }, 0x00aaff);

    return logId;
  }
}

module.exports = { AuditLogger };