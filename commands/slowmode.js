const { PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'slowmode',
  description: 'Set slowmode for the channel',
  usage: '!slowmode <seconds>',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return message.reply('You do not have permission to set slowmode.');
    const duration = parseInt(args[0]);
    if (isNaN(duration) || duration < 0 || duration > 21600) return message.reply('Please provide a number between 0 and 21600 seconds (6 hours).');
    try {
      await message.channel.setRateLimitPerUser(duration);
      message.channel.send(`🐢 Slowmode set to ${duration} seconds.`);
      const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🐢 Slowmode Enabled')
          .setDescription(`**Moderator:** ${message.author.tag}\n**Duration:** ${duration} seconds`)
          .setColor(0x008000)
          .setTimestamp();
        logChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      message.reply('Unable to set slowmode.');
    }
  }
};
