// commands/shop.js — view and purchase items from the shop

const config = require('../config');
const { formatCurrency, currencyDisplay, botName } = require('../utils');

module.exports = {
  name: 'shop',
  description: 'View items available in the shop',
  usage: '!shop [category] OR !shop buy <item_id>',
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      // Shop buy command
      if (args[0] === 'buy') {
        const itemId = args[1];
        if (!itemId) {
          return message.reply('❌ Please specify an item ID! Usage: `!shop buy <item_id>`');
        }

        const result = await economySystem.purchaseItem(message.author.id, itemId);
        
        if (!result.success) {
          return message.reply(`❌ ${result.error}`);
        }

        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('🛒 Purchase Successful!')
          .setDescription(`You bought **${result.item.emoji} ${result.item.name}** for **${formatCurrency(result.item.price, config)}**!`)
          .setFooter({ text: 'Check your inventory with !inventory' })
          .setTimestamp();

        await message.reply({ embeds: [embed] });
        return;
      }

      // View shop
      const category = args[0]?.toLowerCase();
      const items = await economySystem.getShopItems(category);

      if (items.length === 0) {
        return message.reply('❌ No items found in that category!');
      }

      // Group by category
      const categories = {};
      items.forEach(item => {
        if (!categories[item.category]) {
          categories[item.category] = [];
        }
        categories[item.category].push(item);
      });

      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`🏪 ${botName(config)} Shop`)
        .setDescription(`Purchase items with your ${currencyDisplay(config)}!\nUse \`!shop buy <item_id>\` to purchase.`)
        .setFooter({ text: 'Earn money with !daily, !work, and !trivia' });

      for (const [cat, catItems] of Object.entries(categories)) {
        const itemList = catItems.map(item => {
          const duration = item.duration_hours ? ` (${item.duration_hours}h)` : '';
          return `${item.emoji} **${item.name}**${duration}\n💰 ${formatCurrency(item.price, config)} • ID: \`${item.id}\`\n${item.description}`;
        }).join('\n\n');

        embed.addFields({ 
          name: `${cat.charAt(0).toUpperCase() + cat.slice(1)}s`, 
          value: itemList, 
          inline: false 
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in shop command:', error);
      await message.reply('❌ Error loading shop. Try again later.');
    }
  }
};
