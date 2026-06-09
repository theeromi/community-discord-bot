const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'serverinfo',
  description: 'Show server information',
  usage: '!serverinfo',
  async execute(message) {
    const embed = new EmbedBuilder()
      .setTitle('📡 Server Info')
      .addFields(
        { name: 'Name', value: message.guild.name, inline: true },
        { name: 'Members', value: `${message.guild.memberCount}`, inline: true },
        { name: 'Created On', value: message.guild.createdAt.toDateString(), inline: false }
      );
    message.channel.send({ embeds: [embed] });
  }
};
