// commands/work.js — work to earn currency

const config = require('../config');
const { formatCurrency, currencyDisplay } = require('../utils');

module.exports = {
  name: 'work',
  description: `Work to earn ${currencyDisplay(config)} (1-hour cooldown)`,
  usage: '!work',
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      const result = await economySystem.work(message.author.id);

      if (!result.success) {
        const minutesUntil = Math.ceil((result.nextWork - Date.now()) / (1000 * 60));
        const embed = new EmbedBuilder()
          .setColor(0xFF6B6B)
          .setTitle('😴 You\'re Too Tired to Work')
          .setDescription(`Rest for **${minutesUntil} minutes** before working again!`)
          .addFields(
            { name: '⏳ Next Work', value: `<t:${Math.floor(result.nextWork.getTime() / 1000)}:R>`, inline: true }
          );

        await message.reply({ embeds: [embed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x00D9FF)
        .setTitle('💼 Work Complete!')
        .setDescription(`You **${result.job}** and earned **${formatCurrency(result.amount, config)}**!`)
        .setFooter({ text: 'Work again in 1 hour!' })
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
      console.error('Error in work command:', error);
      await message.reply('❌ Error working. Try again later.');
    }
  }
};
