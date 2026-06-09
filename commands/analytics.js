module.exports = {
  name: 'analytics',
  description: 'Display server analytics and usage statistics',
  usage: '!analytics [days]',
  permissions: ['admin', 'mod'],
  async execute(message, args, db, EmbedBuilder) {
    try {
      const days = parseInt(args[0]) || 7; // Default to 7 days
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);

      // Get user statistics
      let totalUsers = 0;
      let activeUsers = 0;
      let topUsers = [];

      await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
          if (err) reject(err);
          else {
            totalUsers = row.count;
            resolve();
          }
        });
      });

      // Get top XP users
      await new Promise((resolve, reject) => {
        db.all('SELECT username, xp, level, messages, voiceMinutes FROM users ORDER BY xp DESC LIMIT 5', (err, rows) => {
          if (err) reject(err);
          else {
            topUsers = rows;
            resolve();
          }
        });
      });

      // Get total XP and messages
      let totalXP = 0;
      let totalMessages = 0;
      let totalVoiceMinutes = 0;

      await new Promise((resolve, reject) => {
        db.get('SELECT SUM(xp) as totalXP, SUM(messages) as totalMessages, SUM(voiceMinutes) as totalVoice FROM users', (err, row) => {
          if (err) reject(err);
          else {
            totalXP = row.totalXP || 0;
            totalMessages = row.totalMessages || 0;
            totalVoiceMinutes = row.totalVoice || 0;
            resolve();
          }
        });
      });

      // Convert voice minutes to hours
      const totalVoiceHours = Math.floor(totalVoiceMinutes / 60);

      // Create top users list
      const topUsersText = topUsers.map((user, index) =>
        `${index + 1}. **${user.username}** - ${user.xp} XP (Level ${user.level})`
      ).join('\n') || 'No users found';

      const embed = new EmbedBuilder()
        .setTitle('📊 Server Analytics')
        .setColor('#3498db')
        .addFields(
          { name: '👥 Total Users', value: totalUsers.toString(), inline: true },
          { name: '⭐ Total XP Earned', value: totalXP.toLocaleString(), inline: true },
          { name: '💬 Total Messages', value: totalMessages.toLocaleString(), inline: true },
          { name: '🎤 Total Voice Time', value: `${totalVoiceHours.toLocaleString()} hours`, inline: true },
          { name: '📈 Average XP per User', value: totalUsers > 0 ? Math.round(totalXP / totalUsers).toString() : '0', inline: true },
          { name: '📝 Average Messages per User', value: totalUsers > 0 ? Math.round(totalMessages / totalUsers).toString() : '0', inline: true },
          { name: '🏆 Top XP Earners', value: topUsersText, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: `Analytics for last ${days} days` });

      // Add server-specific stats
      const guild = message.guild;
      if (guild) {
        embed.addFields(
          { name: '🏠 Server Info', value: `**${guild.name}**\nMembers: ${guild.memberCount}\nChannels: ${guild.channels.cache.size}\nRoles: ${guild.roles.cache.size}`, inline: true }
        );
      }

      return message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Analytics command error:', error);
      return message.reply('⚠️ Error retrieving analytics data.');
    }
  }
};