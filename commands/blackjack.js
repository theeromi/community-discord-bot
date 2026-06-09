// commands/blackjack.js — play a quick blackjack hand

const config = require('../config');
const { formatCurrency } = require('../utils');

module.exports = {
  name: 'blackjack',
  aliases: ['bj', '21'],
  description: 'Play a quick blackjack hand against the dealer',
  usage: '!blackjack <bet>',
  
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      if (!economySystem || !economySystem.initialized) {
        return message.reply('❌ Economy system is not available.');
      }

      const bet = parseInt(args[0]);
      if (isNaN(bet) || bet < 10) {
        return message.reply(`❌ Please bet at least ${formatCurrency(10, config)}! Usage: \`!blackjack <amount>\``);
      }
      if (bet > 1000) {
        return message.reply(`❌ Maximum bet is ${formatCurrency(1000, config)}!`);
      }

      const balance = await economySystem.getBalance(message.author.id);
      if (balance.balance < bet) {
        return message.reply(`❌ You don't have enough money! You only have ${formatCurrency(balance.balance, config)}.`);
      }

      // Basic deck and values
      const cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      const values = { A: 11, J: 10, Q: 10, K: 10 };

      function drawCard() {
        return cards[Math.floor(Math.random() * cards.length)];
      }

      function handValue(hand) {
        let total = 0;
        let aces = 0;
        for (const card of hand) {
          if (card === 'A') aces++;
          total += values[card] || parseInt(card);
        }
        while (total > 21 && aces > 0) {
          total -= 10; // Convert an Ace from 11 to 1
          aces--;
        }
        return total;
      }

      // Initial deal
      const playerHand = [drawCard(), drawCard()];
      const dealerHand = [drawCard(), drawCard()];

      // Simple player strategy: hit until 17 or more
      while (handValue(playerHand) < 17) {
        playerHand.push(drawCard());
      }

      // Dealer hits until 17 or more
      while (handValue(dealerHand) < 17) {
        dealerHand.push(drawCard());
      }

      const playerTotal = handValue(playerHand);
      const dealerTotal = handValue(dealerHand);

      let outcome = '';
      let color = 0xFFD700;
      let net = 0;

      if (playerTotal > 21) {
        outcome = '💥 Bust! You lose.';
        color = 0xFF6B6B;
        net = -bet;
        await economySystem.removeMoney(message.author.id, bet, 'Blackjack loss');
      } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
        outcome = '🎉 You win!';
        color = 0x00FF7F;
        net = bet;
        await economySystem.addMoney(message.author.id, bet, 'Blackjack win');
      } else if (playerTotal === dealerTotal) {
        outcome = '🤝 Push. Bet returned.';
        color = 0x00BFFF;
        net = 0;
      } else {
        outcome = '📉 Dealer wins.';
        color = 0xFF6B6B;
        net = -bet;
        await economySystem.removeMoney(message.author.id, bet, 'Blackjack loss');
      }

      // Track games played for achievements
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

      const finalBalance = await economySystem.getBalance(message.author.id);

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🃏 Blackjack')
        .addFields(
          { name: 'Your Hand', value: `${playerHand.join(' ')} (${playerTotal})`, inline: false },
          { name: 'Dealer Hand', value: `${dealerHand.join(' ')} (${dealerTotal})`, inline: false },
          { name: 'Outcome', value: outcome, inline: false },
          { name: 'Bet', value: formatCurrency(bet, config), inline: true },
          { name: 'Net', value: `${net >= 0 ? '+' : '-'}${formatCurrency(Math.abs(net), config)}`, inline: true },
          { name: 'Balance', value: formatCurrency(finalBalance.balance, config), inline: false }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error in blackjack command:', error);
      message.reply('❌ Error playing blackjack. Please try again later.');
    }
  }
};
