// analytics.js
// Command usage analytics system for Dimandem Bot

const { promisifyDB, DatabaseError } = require('./errorHandler');
const { logWithTimestamp, errorWithTimestamp } = require('./logger');

class Analytics {
  constructor(db) {
    this.db = promisifyDB(db);
    this.sessionData = new Map(); // Track current session data
    this.initDatabase();
  }

  // Initialize analytics database tables
  async initDatabase() {
    try {
      // Command usage tracking
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS command_analytics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          command_name TEXT NOT NULL,
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          execution_time INTEGER, -- milliseconds
          success BOOLEAN DEFAULT 1,
          error_type TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          date TEXT NOT NULL -- YYYY-MM-DD for easy daily queries
        )
      `);

      // Daily usage summaries
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS daily_analytics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          total_commands INTEGER DEFAULT 0,
          unique_users INTEGER DEFAULT 0,
          most_used_command TEXT,
          average_execution_time INTEGER,
          error_rate REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(date, guild_id)
        )
      `);

      // User activity patterns
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS user_activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          hour_of_day INTEGER NOT NULL, -- 0-23
          day_of_week INTEGER NOT NULL, -- 0-6 (Sunday = 0)
          command_count INTEGER DEFAULT 1,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, guild_id, hour_of_day, day_of_week)
        )
      `);

      // Feature usage tracking
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS feature_analytics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feature_name TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          usage_count INTEGER DEFAULT 1,
          last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(feature_name, guild_id)
        )
      `);

      // Create indexes for better performance
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_command_date ON command_analytics(date)');
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_command_guild ON command_analytics(guild_id)');
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_command_user ON command_analytics(user_id)');
      await this.db.run('CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_analytics(date)');

      logWithTimestamp('Analytics system initialized');
    } catch (error) {
      errorWithTimestamp('Failed to initialize analytics:', error);
      throw error;
    }
  }

  // Record command execution
  async recordCommand(commandName, userId, guildId, channelId, executionTime, success = true, errorType = null) {
    try {
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const now = new Date();

      // Coalesce nullable fields to safe sentinels so the NOT NULL constraint
      // on command_analytics doesn't reject DM-issued or system-issued commands.
      const userIdSafe    = userId    || 'unknown';
      const guildIdSafe   = guildId   || 'dm';
      const channelIdSafe = channelId || 'unknown';

      // Record detailed command execution
      await this.db.run(`
        INSERT INTO command_analytics (
          command_name, user_id, guild_id, channel_id,
          execution_time, success, error_type, date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [commandName, userIdSafe, guildIdSafe, channelIdSafe, executionTime, success, errorType, date]);

      // Update user activity patterns
      await this.updateUserActivity(userIdSafe, guildIdSafe, now);

      // Update session data
      this.updateSessionData(commandName, userIdSafe, guildIdSafe);

      logWithTimestamp(`Recorded analytics: ${commandName} by ${userIdSafe} (${executionTime}ms)`);

    } catch (error) {
      errorWithTimestamp('Failed to record command analytics:', error);
      throw new DatabaseError('Failed to record command analytics', 'INSERT');
    }
  }

  // Update user activity patterns
  async updateUserActivity(userId, guildId, timestamp = new Date()) {
    try {
      const hourOfDay = timestamp.getHours();
      const dayOfWeek = timestamp.getDay();

      await this.db.run(`
        INSERT INTO user_activity (user_id, guild_id, hour_of_day, day_of_week, command_count)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(user_id, guild_id, hour_of_day, day_of_week)
        DO UPDATE SET
          command_count = command_count + 1,
          last_updated = CURRENT_TIMESTAMP
      `, [userId, guildId, hourOfDay, dayOfWeek]);

    } catch (error) {
      errorWithTimestamp('Failed to update user activity:', error);
    }
  }

  // Update session data (in-memory for real-time stats)
  updateSessionData(commandName, userId, guildId) {
    const sessionKey = `${guildId}:session`;

    if (!this.sessionData.has(sessionKey)) {
      this.sessionData.set(sessionKey, {
        commands: new Map(),
        users: new Set(),
        startTime: Date.now()
      });
    }

    const session = this.sessionData.get(sessionKey);
    session.commands.set(commandName, (session.commands.get(commandName) || 0) + 1);
    session.users.add(userId);
  }

  // Record feature usage
  async recordFeature(featureName, guildId) {
    try {
      await this.db.run(`
        INSERT INTO feature_analytics (feature_name, guild_id, usage_count)
        VALUES (?, ?, 1)
        ON CONFLICT(feature_name, guild_id)
        DO UPDATE SET
          usage_count = usage_count + 1,
          last_used = CURRENT_TIMESTAMP
      `, [featureName, guildId]);

    } catch (error) {
      errorWithTimestamp('Failed to record feature usage:', error);
    }
  }

  // Generate daily analytics summary
  async generateDailySummary(date = null, guildId = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];

      const guilds = guildId ? [guildId] : await this.getActiveGuilds(targetDate);

      for (const guild of guilds) {
        const stats = await this.getDailyStats(targetDate, guild);

        await this.db.run(`
          INSERT OR REPLACE INTO daily_analytics (
            date, guild_id, total_commands, unique_users,
            most_used_command, average_execution_time, error_rate
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          targetDate, guild, stats.totalCommands, stats.uniqueUsers,
          stats.mostUsedCommand, stats.averageExecutionTime, stats.errorRate
        ]);
      }

      logWithTimestamp(`Generated daily summary for ${targetDate}`);
    } catch (error) {
      errorWithTimestamp('Failed to generate daily summary:', error);
      throw error;
    }
  }

  // Get daily statistics for a guild
  async getDailyStats(date, guildId) {
    try {
      // Total commands
      const totalResult = await this.db.get(`
        SELECT COUNT(*) as total FROM command_analytics
        WHERE date = ? AND guild_id = ?
      `, [date, guildId]);

      // Unique users
      const usersResult = await this.db.get(`
        SELECT COUNT(DISTINCT user_id) as unique_users FROM command_analytics
        WHERE date = ? AND guild_id = ?
      `, [date, guildId]);

      // Most used command
      const commandResult = await this.db.get(`
        SELECT command_name, COUNT(*) as usage_count FROM command_analytics
        WHERE date = ? AND guild_id = ?
        GROUP BY command_name
        ORDER BY usage_count DESC
        LIMIT 1
      `, [date, guildId]);

      // Average execution time
      const timeResult = await this.db.get(`
        SELECT AVG(execution_time) as avg_time FROM command_analytics
        WHERE date = ? AND guild_id = ? AND execution_time IS NOT NULL
      `, [date, guildId]);

      // Error rate
      const errorResult = await this.db.get(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as errors
        FROM command_analytics
        WHERE date = ? AND guild_id = ?
      `, [date, guildId]);

      const errorRate = errorResult.total > 0 ? errorResult.errors / errorResult.total : 0;

      return {
        totalCommands: totalResult.total || 0,
        uniqueUsers: usersResult.unique_users || 0,
        mostUsedCommand: commandResult?.command_name || null,
        averageExecutionTime: Math.round(timeResult.avg_time || 0),
        errorRate: Math.round(errorRate * 100) / 100
      };

    } catch (error) {
      errorWithTimestamp('Failed to get daily stats:', error);
      throw error;
    }
  }

  // Get active guilds for a date
  async getActiveGuilds(date) {
    try {
      const result = await this.db.all(`
        SELECT DISTINCT guild_id FROM command_analytics
        WHERE date = ?
      `, [date]);

      return result.map(row => row.guild_id);
    } catch (error) {
      errorWithTimestamp('Failed to get active guilds:', error);
      return [];
    }
  }

  // Get command usage statistics
  async getCommandStats(guildId, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      const result = await this.db.all(`
        SELECT
          command_name,
          COUNT(*) as usage_count,
          AVG(execution_time) as avg_execution_time,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count
        FROM command_analytics
        WHERE guild_id = ? AND date >= ?
        GROUP BY command_name
        ORDER BY usage_count DESC
      `, [guildId, startDateStr]);

      return result.map(row => ({
        command: row.command_name,
        usageCount: row.usage_count,
        averageExecutionTime: Math.round(row.avg_execution_time || 0),
        errorCount: row.error_count,
        errorRate: row.usage_count > 0 ? Math.round((row.error_count / row.usage_count) * 100) / 100 : 0
      }));

    } catch (error) {
      errorWithTimestamp('Failed to get command stats:', error);
      throw error;
    }
  }

  // Get user activity patterns
  async getUserActivityPattern(userId, guildId) {
    try {
      const result = await this.db.all(`
        SELECT hour_of_day, day_of_week, command_count
        FROM user_activity
        WHERE user_id = ? AND guild_id = ?
        ORDER BY command_count DESC
      `, [userId, guildId]);

      const pattern = {
        mostActiveHour: null,
        mostActiveDay: null,
        totalCommands: 0,
        hourlyDistribution: new Array(24).fill(0),
        dailyDistribution: new Array(7).fill(0)
      };

      let maxHourCount = 0;
      let maxDayCount = 0;

      for (const row of result) {
        pattern.totalCommands += row.command_count;
        pattern.hourlyDistribution[row.hour_of_day] += row.command_count;
        pattern.dailyDistribution[row.day_of_week] += row.command_count;

        if (row.command_count > maxHourCount) {
          maxHourCount = row.command_count;
          pattern.mostActiveHour = row.hour_of_day;
        }

        if (pattern.dailyDistribution[row.day_of_week] > maxDayCount) {
          maxDayCount = pattern.dailyDistribution[row.day_of_week];
          pattern.mostActiveDay = row.day_of_week;
        }
      }

      return pattern;
    } catch (error) {
      errorWithTimestamp('Failed to get user activity pattern:', error);
      throw error;
    }
  }

  // Get real-time session stats
  getSessionStats(guildId) {
    const sessionKey = `${guildId}:session`;
    const session = this.sessionData.get(sessionKey);

    if (!session) {
      return {
        commandsExecuted: 0,
        uniqueUsers: 0,
        sessionDuration: 0,
        topCommands: []
      };
    }

    const topCommands = Array.from(session.commands.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([command, count]) => ({ command, count }));

    return {
      commandsExecuted: Array.from(session.commands.values()).reduce((sum, count) => sum + count, 0),
      uniqueUsers: session.users.size,
      sessionDuration: Date.now() - session.startTime,
      topCommands
    };
  }

  // Get analytics dashboard data
  async getDashboardData(guildId, days = 30) {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Get daily summaries
      const dailyData = await this.db.all(`
        SELECT * FROM daily_analytics
        WHERE guild_id = ? AND date >= ? AND date <= ?
        ORDER BY date DESC
      `, [guildId, startDateStr, endDate]);

      // Get feature usage
      const featureData = await this.db.all(`
        SELECT * FROM feature_analytics
        WHERE guild_id = ?
        ORDER BY usage_count DESC
      `, [guildId]);

      // Get recent command stats
      const commandStats = await this.getCommandStats(guildId, days);

      return {
        period: `${days} days`,
        dailySummaries: dailyData,
        featureUsage: featureData,
        commandStats,
        sessionStats: this.getSessionStats(guildId)
      };

    } catch (error) {
      errorWithTimestamp('Failed to get dashboard data:', error);
      throw error;
    }
  }

  // Clean up old analytics data
  async cleanup(maxAge = 90) { // 90 days default
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAge);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      const result = await this.db.run(`
        DELETE FROM command_analytics
        WHERE date < ?
      `, [cutoffDateStr]);

      if (result.changes > 0) {
        logWithTimestamp(`Cleaned up ${result.changes} old analytics entries`);
      }

      return result.changes;
    } catch (error) {
      errorWithTimestamp('Failed to cleanup analytics:', error);
      throw error;
    }
  }
}

module.exports = { Analytics };