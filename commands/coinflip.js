// commands/coinflip.js — flip a coin and bet currency

const config = require('../config');
const { formatCurrency, currencyDisplay } = require('../utils');

module.exports = {
  name: 'coinflip',
  aliases: ['cf', 'flip'],
  description: `Bet ${currencyDisplay(config)} on a coin flip (heads or tails)`,
  usage: '!coinflip <heads/tails> <amount>',
  
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      if (!economySystem || !economySystem.initialized) {
        return message.reply('❌ Economy system is not available.');
      }
      
      // Parse arguments
      const choice = args[0]?.toLowerCase();
      const amount = parseInt(args[1]);
      
      if (!choice || !['heads', 'tails', 'h', 't'].includes(choice)) {
        return message.reply('❌ Please choose heads or tails! Usage: `!coinflip <heads/tails> <amount>`');
      }
      
      if (isNaN(amount) || amount < 10) {
        return message.reply(`❌ Please bet at least ${formatCurrency(10, config)}! Usage: \`!coinflip <heads/tails> <amount>\``);
      }

      if (amount > 1000) {
        return message.reply(`❌ Maximum bet is ${formatCurrency(1000, config)}!`);
      }

      // Check balance
      const balance = await economySystem.getBalance(message.author.id);
      if (balance.balance < amount) {
        return message.reply(`❌ You don't have enough money! You only have ${formatCurrency(balance.balance, config)}.`);
      }
      
      // Normalize choice
      const userChoice = choice.startsWith('h') ? 'heads' : 'tails';
      
      // Flip the coin
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const won = result === userChoice;
      
      // Update balance
      if (won) {
        await economySystem.addMoney(message.author.id, amount, `Won coinflip (${result})`);
      } else {
        await economySystem.removeMoney(message.author.id, amount, `Lost coinflip (${result})`);
      }
      
      // Track game stats for achievements
      const currentStats = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM achievement_stats WHERE user_id = ?`, [message.author.id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      let newStreak = won ? (currentStats?.coinflip_streak || 0) + 1 : 0;
      let bestStreak = currentStats?.best_coinflip_streak || 0;
      if (newStreak > bestStreak) bestStreak = newStreak;

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO achievement_stats (user_id, games_played, coinflip_streak, best_coinflip_streak)
           VALUES (?, 1, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             games_played = games_played + 1,
             coinflip_streak = ?,
             best_coinflip_streak = ?`,
          [message.author.id, newStreak, bestStreak, newStreak, bestStreak],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Create result embed
      const coinEmoji = result === 'heads' ? '🪙' : '💿';
      const resultEmoji = won ? '🎉' : '💔';
      const newBalance = await economySystem.getBalance(message.author.id);
      
      const embed = new EmbedBuilder()
        .setColor(won ? 0x00FF00 : 0xFF0000)
        .setTitle(`${coinEmoji} Coin Flip ${resultEmoji}`)
        .setDescription(`The coin landed on **${result}**!`)
        .addFields(
          { name: 'Your Choice', value: userChoice, inline: true },
          { name: 'Result', value: result, inline: true },
          { name: 'Bet Amount', value: formatCurrency(amount, config), inline: true },
          { name: won ? '💰 Winnings' : '📉 Lost', value: formatCurrency(amount, config), inline: true },
          { name: '💵 New Balance', value: formatCurrency(newBalance.balance, config), inline: true }
        )
        .setFooter({ text: won ? 'Winner winner!' : 'Better luck next time!' })
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error in coinflip command:', error);
      message.reply('❌ Error playing coinflip. Please try again later.');
    }
  }
};
