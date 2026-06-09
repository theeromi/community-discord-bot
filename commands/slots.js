// commands/slots.js — slot machine gambling game

const config = require('../config');
const { formatCurrency } = require('../utils');

module.exports = {
  name: 'slots',
  aliases: ['slot', 'slotmachine'],
  description: 'Play the slot machine and try your luck!',
  usage: '!slots <amount>',
  
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      if (!economySystem || !economySystem.initialized) {
        return message.reply('❌ Economy system is not available.');
      }
      
      // Parse bet amount
      const amount = parseInt(args[0]);
      
      if (isNaN(amount) || amount < 10) {
        return message.reply(`❌ Please bet at least ${formatCurrency(10, config)}! Usage: \`!slots <amount>\``);
      }

      if (amount > 500) {
        return message.reply(`❌ Maximum bet is ${formatCurrency(500, config)}!`);
      }

      // Check balance
      const balance = await economySystem.getBalance(message.author.id);
      if (balance.balance < amount) {
        return message.reply(`❌ You don't have enough money! You only have ${formatCurrency(balance.balance, config)}.`);
      }
      
      // Deduct bet
      await economySystem.removeMoney(message.author.id, amount, 'Slots bet');
      
      // Slot symbols with different weights
      const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
      const weights = [25, 20, 18, 15, 12, 7, 3]; // Lower = rarer
      
      // Weighted random selection
      function getRandomSymbol() {
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < symbols.length; i++) {
          random -= weights[i];
          if (random <= 0) return symbols[i];
        }
        return symbols[0];
      }
      
      // Spin the slots
      const slot1 = getRandomSymbol();
      const slot2 = getRandomSymbol();
      const slot3 = getRandomSymbol();
      
      // Calculate winnings
      let multiplier = 0;
      let result = '';
      
      if (slot1 === slot2 && slot2 === slot3) {
        // All three match - JACKPOT!
        if (slot1 === '7️⃣') {
          multiplier = 20; // 20x for triple 7s
          result = '🎰 **MEGA JACKPOT!!!** 🎰';
        } else if (slot1 === '💎') {
          multiplier = 15; // 15x for triple diamonds
          result = '💎 **DIAMOND JACKPOT!!!** 💎';
        } else if (slot1 === '⭐') {
          multiplier = 10; // 10x for triple stars
          result = '⭐ **SUPER JACKPOT!!!** ⭐';
        } else {
          multiplier = 5; // 5x for any other triple
          result = '🎉 **JACKPOT!!!** 🎉';
        }
      } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
        // Two match
        multiplier = 2; // 2x for two matching
        result = '✨ Two Match! ✨';
      } else {
        // No match
        result = '💔 No Match';
      }
      
      const winnings = Math.floor(amount * multiplier);
      const profit = winnings - amount;
      
      // Add winnings if any
      if (winnings > 0) {
        await economySystem.addMoney(message.author.id, winnings, `Slots win (${slot1}${slot2}${slot3})`);
      // Track game stats for achievements
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO achievement_stats (user_id, games_played) VALUES (?, 1)
           ON CONFLICT(user_id) DO UPDATE SET games_played = games_played + 1`,
          [message.author.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      }
      
      const newBalance = await economySystem.getBalance(message.author.id);
      
      // Create result embed
      const embed = new EmbedBuilder()
        .setColor(multiplier > 0 ? 0xFFD700 : 0xFF6B6B)
        .setTitle('🎰 Slot Machine 🎰')
        .setDescription(`**[ ${slot1} ${slot2} ${slot3} ]**\n\n${result}`)
        .addFields(
          { name: '💰 Bet', value: formatCurrency(amount, config), inline: true },
          { name: multiplier > 0 ? '✨ Multiplier' : '📉 Result', value: multiplier > 0 ? `${multiplier}x` : 'Lost', inline: true },
          { name: profit > 0 ? '🎉 Profit' : '💔 Lost', value: profit > 0 ? `+${formatCurrency(profit, config)}` : formatCurrency(amount, config), inline: true },
          { name: '💵 Balance', value: formatCurrency(newBalance.balance, config), inline: false }
        )
        .setFooter({ text: multiplier > 0 ? 'Lady luck is on your side!' : 'Try again!' })
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error in slots command:', error);
      message.reply('❌ Error playing slots. Please try again later.');
    }
  }
};
