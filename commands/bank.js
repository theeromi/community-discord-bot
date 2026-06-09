// commands/bank.js — deposit and withdraw from your bank

const config = require('../config');
const { formatCurrency, currencyDisplay } = require('../utils');

module.exports = {
  name: 'bank',
  aliases: ['deposit', 'withdraw', 'dep', 'with'],
  description: `Deposit or withdraw ${currencyDisplay(config)} from your bank`,
  usage: '!bank deposit <amount|all> OR !bank withdraw <amount|all>',
  
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    
    try {
      if (!economySystem || !economySystem.initialized) {
        return message.reply('❌ Economy system is not available.');
      }

      const userId = message.author.id;
      const current = await economySystem.getBalance(userId);

      // If no args, show help
      if (!args[0]) {
        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('🏦 Bank Commands')
          .setDescription('Keep your money safe in the bank!')
          .addFields(
            { name: '💵 Your Cash', value: formatCurrency(current.balance, config), inline: true },
            { name: '🏦 Your Bank', value: formatCurrency(current.bank, config), inline: true },
            { name: '\u200B', value: '\u200B', inline: true },
            { name: '📥 Deposit', value: '`!bank deposit <amount>`\n`!bank deposit all`', inline: true },
            { name: '📤 Withdraw', value: '`!bank withdraw <amount>`\n`!bank withdraw all`', inline: true }
          )
          .setFooter({ text: '💡 Bank money is safe from robberies!' })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const action = args[0].toLowerCase();
      let amount = args[1]?.toLowerCase();

      // Handle aliases
      const commandUsed = message.content.split(' ')[0].toLowerCase().replace('!', '');
      let finalAction = action;
      
      if (commandUsed === 'deposit' || commandUsed === 'dep') {
        finalAction = 'deposit';
        amount = args[0]?.toLowerCase(); // First arg is the amount
      } else if (commandUsed === 'withdraw' || commandUsed === 'with') {
        finalAction = 'withdraw';
        amount = args[0]?.toLowerCase();
      }

      // Validate action
      if (!['deposit', 'dep', 'withdraw', 'with'].includes(finalAction)) {
        return message.reply('❌ Invalid action! Use `!bank deposit <amount>` or `!bank withdraw <amount>`');
      }

      if (!amount) {
        return message.reply('❌ Please specify an amount! Example: `!bank deposit 100` or `!bank withdraw all`');
      }

      // Parse amount
      let amountNum;
      if (amount === 'all') {
        amountNum = finalAction.startsWith('dep') ? current.balance : current.bank;
      } else {
        amountNum = parseInt(amount);
      }

      if (isNaN(amountNum) || amountNum <= 0) {
        return message.reply('❌ Please enter a valid amount greater than 0!');
      }

      // Execute transaction
      let result;
      if (finalAction.startsWith('dep')) {
        result = await economySystem.deposit(userId, amountNum);
        
        if (!result.success) {
          const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('❌ Deposit Failed')
            .setDescription(result.error)
            .addFields(
              { name: '💵 Available Cash', value: formatCurrency(current.balance, config), inline: true }
            );
          return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('📥 Deposit Successful!')
          .setDescription(`You deposited **${formatCurrency(amountNum, config)}** into your bank.`)
          .addFields(
            { name: '💵 Cash', value: formatCurrency(result.cash, config), inline: true },
            { name: '🏦 Bank', value: formatCurrency(result.bank, config), inline: true }
          )
          .setFooter({ text: 'Your money is now safe!' })
          .setTimestamp();
        return message.reply({ embeds: [embed] });

      } else {
        result = await economySystem.withdraw(userId, amountNum);
        
        if (!result.success) {
          const embed = new EmbedBuilder()
            .setColor(0xFF6B6B)
            .setTitle('❌ Withdrawal Failed')
            .setDescription(result.error)
            .addFields(
              { name: '🏦 Available in Bank', value: formatCurrency(current.bank, config), inline: true }
            );
          return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('📤 Withdrawal Successful!')
          .setDescription(`You withdrew **${formatCurrency(amountNum, config)}** from your bank.`)
          .addFields(
            { name: '💵 Cash', value: formatCurrency(result.cash, config), inline: true },
            { name: '🏦 Bank', value: formatCurrency(result.bank, config), inline: true }
          )
          .setFooter({ text: 'Ready to spend!' })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

    } catch (error) {
      console.error('Error in bank command:', error);
      await message.reply('❌ An error occurred with the bank. Try again later.');
    }
  }
};
