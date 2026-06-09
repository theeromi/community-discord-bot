// commands/balance.js — check virtual currency balance

const config = require('../config');
const { formatCurrency, currencyDisplay } = require('../utils');

module.exports = {
  name: 'balance',
  aliases: ['bal', 'money', 'cash'],
  description: `Check your ${currencyDisplay(config)} balance`,
  usage: '!balance [@user]',
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      const targetUser = message.mentions.users.first() || message.author;
      const balance = await economySystem.getBalance(targetUser.id);

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`💰 ${targetUser.username}'s Wallet`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          { name: '💵 Cash', value: formatCurrency(balance.balance, config), inline: true },
          { name: '🏦 Bank', value: formatCurrency(balance.bank, config), inline: true },
          { name: '💎 Total', value: formatCurrency(balance.balance + balance.bank, config), inline: true }
        )
        .setFooter({ text: 'Earn money with !daily, !work, and !trivia' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in balance command:', error);
      await message.reply('❌ Error checking balance. Try again later.');
    }
  }
};
