// commands/voiceleaderboard.js
// Shows top users by cumulative voice activity

module.exports = {
  name: 'voiceleaderboard',
  aliases: ['voicelb', 'vclb', 'voiceboard'],
  description: 'Show the top 10 users by voice minutes.',
  async execute(message, args, db, EmbedBuilder) {
    db.all(
      `SELECT username, voiceMinutes
       FROM users
       WHERE voiceMinutes > 0
       ORDER BY voiceMinutes DESC
       LIMIT 10`,
      [],
      (err, rows) => {
        if (err) {
          message.channel.send('⚠️ Unable to fetch voice leaderboard.');
          return;
        }

        if (!rows || rows.length === 0) {
          message.channel.send('🎤 No voice activity recorded yet!');
          return;
        }

        const formatMinutes = (minutes) => {
          const total = Number(minutes) || 0;
          const hours = Math.floor(total / 60);
          const mins = total % 60;
          if (hours <= 0) {
            return `${mins}m`;
          }
          return `${hours}h ${mins}m`;
        };

        const leaderboardText = rows.map((row, index) => {
          const username = row.username || 'Unknown User';
          return `${index + 1}. ${username} - ${formatMinutes(row.voiceMinutes)}`;
        }).join('\n');

        const embed = new EmbedBuilder()
          .setTitle('🎤 Voice Activity Leaderboard')
          .setDescription(leaderboardText)
          .setColor(0x1ABC9C)
          .setFooter({ text: 'Top 10 by total voice minutes' })
          .setTimestamp();

        message.channel.send({ embeds: [embed] });
      }
    );
  }
};
