const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'profile',
  description: 'Show your server profile (XP, level, join date, birthday, voice minutes, etc).',
  async execute(message, args, db) {
    // Get target user (mention or self)
    let target = message.mentions.users.first() || message.author;
    db.get(`SELECT * FROM users WHERE id = ?`, [target.id], (err, row) => {
      if (err || !row) {
        return message.channel.send('⚠️ No profile found for this user.');
      }

      const embed = new EmbedBuilder()
        .setTitle(`${target.username}'s Profile`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'XP', value: `${row.xp}`, inline: true },
          { name: 'Level', value: `${row.level}`, inline: true },
          { name: 'Messages', value: `${row.messages || 0}`, inline: true },
          { name: 'Voice Minutes', value: `${row.voiceMinutes || 0}`, inline: true },
          { name: 'Join Date', value: row.joinDate ? `<t:${Math.floor(new Date(row.joinDate).getTime()/1000)}:D>` : 'Unknown', inline: true },
          { name: 'Birthday', value: row.birthday || 'Not set', inline: true }
        )
        .setColor(0x00BFFF)
        .setTimestamp();

      message.channel.send({ embeds: [embed] });
    });
  }
};