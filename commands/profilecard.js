const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { botName } = require('../utils');

module.exports = {
  name: 'profilecard',
  description: 'Show your profile card',
  usage: '!profilecard',
  async execute(message, args, db) {
    db.get(`SELECT * FROM users WHERE id = ?`, [message.author.id], async (err, row) => {
      if (err || !row) return message.reply('No stats found!');
      const avatarURL = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.username)}`;
      const community = (config.branding && config.branding.communityName) || '';
      const profileEmbed = new EmbedBuilder()
        .setTitle(`${row.username}'s Profile Card`)
        .setDescription(community || botName(config))
        .setThumbnail(avatarURL)
        .addFields(
          { name: 'Level', value: `${row.level}`, inline: true },
          { name: 'XP', value: `${row.xp}`, inline: true },
          { name: 'Messages', value: `${row.messages}`, inline: true },
          { name: 'Voice Minutes', value: `${row.voiceMinutes}`, inline: true },
          { name: 'Birthday', value: row.birthday ? row.birthday : 'Not set', inline: true }
        )
        .setColor(0x6e00ff)
        .setFooter({ text: `${botName(config)} Profile Card` });
      message.channel.send({ embeds: [profileEmbed] });
    });
  }
};
