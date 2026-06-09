// commands/richest.js — economy leaderboard

const config = require('../config');
const { formatCurrency } = require('../utils');

module.exports = {
  name: 'richest',
  aliases: ['rich', 'baltop', 'moneylb'],
  description: 'View the richest members in the server',
  usage: '!richest',
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      const leaderboard = await economySystem.getLeaderboard(10);

      if (leaderboard.length === 0) {
        return message.reply('❌ No economy data yet! Start earning with `!daily` and `!work`.');
      }

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('💰 Richest Members')
        .setDescription('Top 10 wealthiest members in the server')
        .setTimestamp();

      const medals = ['🥇', '🥈', '🥉'];
      const leaderboardText = leaderboard.map((user, index) => {
        const medal = medals[index] || `**${index + 1}.**`;
        const username = user.username || 'Unknown User';
        const streak = user.daily_streak > 0 ? ` 🔥${user.daily_streak}` : '';
        return `${medal} ${username}${streak}\n💰 ${formatCurrency(user.balance, config)} • Total Earned: ${formatCurrency(user.total_earned, config)}`;
      }).join('\n\n');

      embed.setDescription(leaderboardText);

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in richest command:', error);
      await message.reply('❌ Error loading leaderboard. Try again later.');
    }
  }
};
