// commands/leaderboard.js
// Handles the !leaderboard command for Dimandem Bot

const config = require('../config');

module.exports = {
  name: 'leaderboard',
  description: 'Show the top 10 users by XP.',
  async execute(message, args, db, EmbedBuilder) {
    db.all(`SELECT username, xp FROM users ORDER BY xp DESC LIMIT 10`, [], (err, rows) => {
      if (err) {
        message.channel.send('⚠️ Unable to fetch leaderboard.');
        return;
      }
      if (rows.length === 0) {
        return message.channel.send('🏆 No active users yet!');
      }
      const leaderboard = rows.map((row, index) => {
        return `${index + 1}. ${row.username} - ${row.xp} XP`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('🏆 Top Talkers Leaderboard')
        .setDescription(leaderboard)
        .setColor(0xFFD700)
        .setTimestamp();

      message.channel.send({ embeds: [embed] });
    });
  }
};
