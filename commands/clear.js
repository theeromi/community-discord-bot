// commands/clear.js
// Handles the !clear command for Dimandem Bot

module.exports = {
  name: 'clear',
  description: 'Clear up to 100 messages (moderator+).',
  async execute(message, args, db, EmbedBuilder) {
    if (!message.member.permissions.has('ManageMessages')) return message.reply('You do not have permission to clear messages.');
    if (!message.guild.members.me.permissions.has('ManageMessages')) {
      return message.reply("I don't have permission to do that!");
    }
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Please provide a number between 1 and 100.');
    try {
      await message.channel.bulkDelete(amount, true);
      message.channel.send(`🧹 Cleared ${amount} messages.`);
      const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🧹 Messages Cleared')
          .setDescription(`**Moderator:** ${message.author.tag}\n**Amount:** ${amount}`)
          .setColor(0x00ffff)
          .setTimestamp();
        logChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      message.reply('There was an error trying to clear messages.');
    }
  }
};
