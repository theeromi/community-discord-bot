const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'userinfo',
  description: 'Show user information',
  usage: '!userinfo [@user]',
  async execute(message, args, db) {
    const user = message.mentions.users.first() || message.author;
    db.get(`SELECT birthday FROM users WHERE id = ?`, [user.id], (err, row) => {
      const embed = new EmbedBuilder()
        .setTitle('🙋 User Info')
        .addFields(
          { name: 'Username', value: user.username, inline: true },
          { name: 'ID', value: user.id, inline: true },
          { name: 'Created On', value: user.createdAt.toDateString(), inline: false },
          row
            ? { name: 'Birthday', value: row.birthday ? row.birthday : 'Not set', inline: true }
            : undefined
        ).setColor(0x00AE86);
      embed.data.fields = embed.data.fields.filter(Boolean);
      message.channel.send({ embeds: [embed] });
    });
  }
};
