// commands/gift.js — send virtual currency to another user

const config = require('../config');
const { formatCurrency, currencyDisplay } = require('../utils');

module.exports = {
  name: 'gift',
  aliases: ['give', 'send', 'pay'],
  description: `Send ${currencyDisplay(config)} to another user`,
  usage: '!gift @user <amount>',
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      const targetUser = message.mentions.users.first();
      if (!targetUser) {
        return message.reply('❌ Please mention a user to gift money to! Usage: `!gift @user <amount>`');
      }

      if (targetUser.id === message.author.id) {
        return message.reply('❌ You can\'t gift money to yourself!');
      }

      if (targetUser.bot) {
        return message.reply('❌ You can\'t gift money to bots!');
      }

      const amount = parseInt(args[1]);
      if (isNaN(amount) || amount <= 0) {
        return message.reply('❌ Please specify a valid amount! Usage: `!gift @user <amount>`');
      }

      if (amount < 10) {
        return message.reply(`❌ Minimum gift amount is ${formatCurrency(10, config)}!`);
      }

      // Check sender's balance
      const senderBalance = await economySystem.getBalance(message.author.id);
      if (senderBalance.balance < amount) {
        return message.reply(`❌ You don't have enough money! You only have ${formatCurrency(senderBalance.balance, config)}.`);
      }

      // Transfer money
      await economySystem.removeMoney(message.author.id, amount, `Gifted to ${targetUser.username}`);
      await economySystem.addMoney(targetUser.id, amount, `Gift from ${message.author.username}`);
      // Track gift stat for achievements
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO achievement_stats (user_id, gifts_given) VALUES (?, 1)
           ON CONFLICT(user_id) DO UPDATE SET gifts_given = gifts_given + 1`,
          [message.author.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });


      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('🎁 Gift Sent!')
        .setDescription(`${message.author} gifted **${formatCurrency(amount, config)}** to ${targetUser}!`)
        .setFooter({ text: 'What a generous soul! 💝' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in gift command:', error);
      await message.reply('❌ Error sending gift. Try again later.');
    }
  }
};
