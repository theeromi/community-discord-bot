module.exports = {
  name: 'health',
  aliases: ['status', 'botstatus'],
  description: 'Display bot health and system statistics',
  usage: '!health | !status',
  permissions: ['admin', 'mod'],
  async execute(message, args, db, EmbedBuilder, context = {}) {
    try {
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      const startTime = Date.now();

      // Test database connection
      let dbStatus = 'Connected';
      let dbResponseTime = 0;
      try {
        const dbStart = Date.now();
        await new Promise((resolve, reject) => {
          db.get('SELECT 1', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        dbResponseTime = Date.now() - dbStart;
      } catch (error) {
        dbStatus = 'Error: ' + error.message;
      }

      // Get user count
      let userCount = 0;
      try {
        await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
            if (err) reject(err);
            else {
              userCount = row.count;
              resolve();
            }
          });
        });
      } catch (error) {
        userCount = 'Error';
      }

      // Get pending reminders count (if table exists)
      let pendingReminders = 0;
      try {
        await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM reminders WHERE reminded = 0', (err, row) => {
            if (err) reject(err);
            else {
              pendingReminders = row?.count || 0;
              resolve();
            }
          });
        });
      } catch (error) {
        pendingReminders = 'N/A';
      }

      // Pull richer monitor metrics when available
      let monitorStatus = null;
      let monitorMetrics = null;
      try {
        if (context.healthMonitor) {
          monitorStatus = context.healthMonitor.getHealthStatus();
          monitorMetrics = context.healthMonitor.getMetrics();
        }
      } catch (error) {
        monitorStatus = null;
        monitorMetrics = null;
      }

      // Format uptime
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);
      const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

      // Format memory usage (convert bytes to MB)
      const memoryMB = {
        rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
        heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
        external: (memoryUsage.external / 1024 / 1024).toFixed(2)
      };

      const discordPing = typeof message?.client?.ws?.ping === 'number'
        ? `${message.client.ws.ping}ms`
        : 'Unknown';

      const overallStatus = monitorStatus?.overall || 'unknown';
      const statusEmoji = overallStatus === 'healthy' ? '✅' : overallStatus === 'warning' ? '⚠️' : overallStatus === 'critical' ? '🚨' : '❔';
      const statusColor = overallStatus === 'healthy' ? 0x00FF00 : overallStatus === 'warning' ? 0xFFA500 : overallStatus === 'critical' ? 0xFF0000 : 0x5865F2;

      const commandCount = monitorMetrics?.commandsExecuted;
      const messageCount = monitorMetrics?.messagesProcessed;
      const avgCommandMs = monitorMetrics?.averageResponseTime?.command;

      const discordHealth = monitorStatus?.discord || 'unknown';
      const dbHealth = monitorStatus?.database || 'unknown';
      const memHealth = monitorStatus?.memory || 'unknown';

      const embed = new EmbedBuilder()
        .setTitle('🏥 Bot Health Status')
        .setColor(statusColor)
        .addFields(
          { name: 'Overall Health', value: `${statusEmoji} ${overallStatus}`, inline: true },
          { name: '⏰ Uptime', value: uptimeString, inline: true },
          { name: '📶 Discord Ping', value: discordPing, inline: true },
          { name: '🔗 Database', value: `${dbStatus} (${dbResponseTime}ms)`, inline: true },
          { name: '🗂️ Pending Reminders', value: pendingReminders.toString(), inline: true },
          { name: '👥 Registered Users', value: userCount.toString(), inline: true },
          { name: '📈 Session Activity', value: `Commands: ${commandCount ?? 'N/A'}\nMessages: ${messageCount ?? 'N/A'}\nAvg Cmd: ${avgCommandMs ?? 'N/A'}ms`, inline: true },
          { name: '🩺 Service Health', value: `Discord: ${discordHealth}\nDatabase: ${dbHealth}\nMemory: ${memHealth}`, inline: true },
          { name: '🧠 Memory Usage', value: `RSS: ${memoryMB.rss}MB\nHeap: ${memoryMB.heapUsed}/${memoryMB.heapTotal}MB\nExternal: ${memoryMB.external}MB`, inline: false },
          { name: '📊 Node.js Version', value: process.version, inline: true },
          { name: '🖥️ Platform', value: process.platform, inline: true },
          { name: '⚡ Response Time', value: `${Date.now() - startTime}ms`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Bot Health Check • Use !status as a shortcut' });

      return message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Health command error:', error);
      return message.reply('⚠️ Error checking bot health status.');
    }
  }
};