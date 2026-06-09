/**
 * News Command - Manually fetch and post news
 * Usage: !news tech | !news cod | !news status
 */

module.exports = {
  name: 'news',
  description: 'Fetch and post news updates (Admin only)',
  aliases: ['fetchnews', 'getnews'],
  usage: '!news <tech|cod|status>',
  
  async execute(message, args, db, EmbedBuilder, context) {
    // Extract newsFeed from context
    const newsFeed = context?.newsFeed;
    
    // Check for admin/mod permissions
    if (!message.member.permissions.has('ManageMessages')) {
      return message.reply('❌ You need Manage Messages permission to use this command.');
    }
    
    if (!args[0]) {
      const embed = new EmbedBuilder()
        .setTitle('📰 News Command')
        .setDescription('Fetch news updates manually')
        .addFields(
          { name: '!news tech', value: 'Fetch tech & AI news', inline: true },
          { name: '!news cod', value: 'Fetch Call of Duty news', inline: true },
          { name: '!news status', value: 'Check news system status', inline: true }
        )
        .setColor(0x00D4AA);
      return message.reply({ embeds: [embed] });
    }
    
    const subCommand = args[0].toLowerCase();
    
    if (subCommand === 'status') {
      const embed = new EmbedBuilder()
        .setTitle('📰 News Feed Status')
        .setColor(newsFeed && newsFeed.initialized ? 0x00FF00 : 0xFF0000)
        .addFields(
          { name: 'System', value: newsFeed && newsFeed.initialized ? '✅ Online' : '❌ Not initialized', inline: true },
          { name: 'Tech Feeds', value: `${newsFeed?.feeds?.techNews?.length || 0} sources`, inline: true },
          { name: 'CoD Feeds', value: `${newsFeed?.feeds?.codNews?.length || 0} sources`, inline: true }
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
    
    if (!newsFeed || !newsFeed.initialized) {
      return message.reply('❌ News feed system is not initialized. Please wait or restart the bot.');
    }
    
    if (subCommand === 'tech') {
      const loadingMsg = await message.reply('🔄 Fetching tech news...');
      try {
        const result = await newsFeed.postTechNews(message.channel.id, 5);
        await loadingMsg.edit(`✅ Posted ${result.posted} tech news articles!`);
      } catch (error) {
        await loadingMsg.edit(`❌ Failed to fetch tech news: ${error.message}`);
      }
    } else if (subCommand === 'cod') {
      const loadingMsg = await message.reply('🔄 Fetching Call of Duty news...');
      try {
        const result = await newsFeed.postCodNews(message.channel.id, 5);
        await loadingMsg.edit(`✅ Posted ${result.posted} CoD news articles!`);
      } catch (error) {
        await loadingMsg.edit(`❌ Failed to fetch CoD news: ${error.message}`);
      }
    } else {
      return message.reply('❌ Unknown option. Use: `!news tech`, `!news cod`, or `!news status`');
    }
  }
};
