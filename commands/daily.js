// commands/daily.js — claim your daily currency reward

const config = require('../config');
const { formatCurrency, currencyDisplay } = require('../utils');

module.exports = {
  name: 'daily',
  description: `Claim your daily ${currencyDisplay(config)} reward (20-hour cooldown)`,
  usage: '!daily',
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      const result = await economySystem.claimDaily(message.author.id);

      if (!result.success) {
        const timeUntil = Math.ceil((result.nextClaim - Date.now()) / (1000 * 60 * 60));
        const embed = new EmbedBuilder()
          .setColor(0xFF6B6B)
          .setTitle('⏰ Daily Already Claimed')
          .setDescription(`Come back in **${timeUntil} hours** to claim your next daily reward!`)
          .addFields(
            { name: '🔥 Current Streak', value: `${result.streak} days`, inline: true },
            { name: '⏳ Next Claim', value: `<t:${Math.floor(result.nextClaim.getTime() / 1000)}:R>`, inline: true }
          );

        await message.reply({ embeds: [embed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('💰 Daily Reward Claimed!')
        .setDescription(`You earned **${formatCurrency(result.amount, config)}**!`)
        .addFields(
          { name: '🔥 Streak', value: `${result.streak} days`, inline: true },
          { name: '💵 Reward', value: formatCurrency(result.amount, config), inline: true },
          { name: '📈 Next Bonus', value: `+${formatCurrency(Math.min((result.streak + 1) * 10, 200), config)}`, inline: true }
        )
        .setFooter({ text: 'Claim daily to build your streak and earn more!' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

      // Track money earned for achievements
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO achievement_stats (user_id, money_earned) VALUES (?, ?)
           ON CONFLICT(user_id) DO UPDATE SET money_earned = money_earned + ?`,
          [message.author.id, result.amount, result.amount],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } catch (error) {
      console.error('Error in daily command:', error);
      await message.reply('❌ Error claiming daily reward. Try again later.');
    }
  }
};
