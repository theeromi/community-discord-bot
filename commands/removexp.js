const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { ensureRole } = require('../utils');

module.exports = {
  name: 'removexp',
  description: 'Remove XP from a user (admin only)',
  usage: '!removexp @user <amount>',
  async execute(message, args, db) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('You do not have permission to adjust XP.');
    }
    const target = message.mentions.members.first();
    const amount = parseInt(args[1], 10);
    if (!target) return message.reply('Usage: `!removexp @user <1-150>`');
    if (isNaN(amount) || amount < 1 || amount > 150) {
      return message.reply('Please provide an amount between 1 and 150.');
    }
    db.get(`SELECT xp, level FROM users WHERE id = ?`, [target.id], (err, row) => {
      if (err) {
        return message.reply('Database error.');
      }
      const currentXp = row ? row.xp : 0;
      const nextXp = Math.max(0, currentXp - amount);
      db.run(
        `INSERT INTO users (id, username, xp, level, messages, voiceMinutes)
         VALUES (?, ?, ?, ?, 0, 0)
         ON CONFLICT(id) DO UPDATE SET xp = ?`,
        [target.id, target.user.username, nextXp, row ? row.level : 0, nextXp],
        (err2) => {
          if (err2) {
            return message.reply('Could not update XP.');
          }
          message.channel.send(`✅ ${amount} XP removed from ${target.user.tag}. New XP: **${nextXp}**`);
          const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setTitle('➖ XP Removed')
              .setDescription(
                `**User:** ${target.user.tag}\n` +
                `**Amount:** ${amount}\n` +
                `**New XP:** ${nextXp}\n` +
                `**By:** ${message.author.tag}`
              )
              .setColor(0xf87171)
              .setTimestamp();
            logChannel.send({ embeds: [embed] });
          }
        }
      );
    });
  }
};
