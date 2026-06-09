// commands/inventory.js - View your purchased items

module.exports = {
  name: 'inventory',
  aliases: ['inv', 'items'],
  description: 'View your purchased items and active boosts',
  usage: '!inventory [@user]',
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      const targetUser = message.mentions.users.first() || message.author;
      const inventory = await economySystem.getInventory(targetUser.id);

      if (inventory.length === 0) {
        return message.reply(`${targetUser.id === message.author.id ? 'You don\'t' : `${targetUser.username} doesn't`} have any items yet! Check out the \`!shop\`.`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`🎒 ${targetUser.username}'s Inventory`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription('Your purchased items and active effects')
        .setTimestamp();

      // Group items by category
      const categories = {
        boost: [],
        cosmetic: [],
        badge: []
      };

      const now = new Date();
      inventory.forEach(item => {
        let status = '✅ Active';
        if (item.expires_at) {
          const expiresAt = new Date(item.expires_at);
          if (expiresAt < now) {
            status = '❌ Expired';
          } else {
            const hoursLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60));
            status = `⏳ ${hoursLeft}h left`;
          }
        }

        const itemStr = `${item.emoji} **${item.name}** - ${status}`;
        categories[item.category].push(itemStr);
      });

      for (const [cat, items] of Object.entries(categories)) {
        if (items.length > 0) {
          embed.addFields({ 
            name: `${cat.charAt(0).toUpperCase() + cat.slice(1)}s`, 
            value: items.join('\n'), 
            inline: false 
          });
        }
      }

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in inventory command:', error);
      await message.reply('❌ Error loading inventory. Try again later.');
    }
  }
};
