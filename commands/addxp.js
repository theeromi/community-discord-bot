const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { ensureRole } = require('../utils');

module.exports = {
  name: 'addxp',
  description: 'Add XP to a user (admin only)',
  usage: '!addxp @user <amount>',
  async execute(message, args, db) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('You do not have permission to adjust XP.');
    }
    const target = message.mentions.members.first();
    const amount = parseInt(args[1], 10);
    if (!target) return message.reply('Usage: `!addxp @user <1-150>`');
    if (isNaN(amount) || amount < 1 || amount > 150) {
      return message.reply('Please provide an amount between 1 and 150.');
    }
    db.get(`SELECT xp, level FROM users WHERE id = ?`, [target.id], (err, row) => {
      if (err) {
        return message.reply('Database error.');
      }
      const currentXp = row ? row.xp : 0;
      const nextXp = Math.max(0, currentXp + amount);
      db.run(
        `INSERT INTO users (id, username, xp, level, messages, voiceMinutes)
         VALUES (?, ?, ?, ?, 0, 0)
         ON CONFLICT(id) DO UPDATE SET xp = ?`,
        [target.id, target.user.username, nextXp, row ? row.level : 0, nextXp],
        (err2) => {
          if (err2) {
            return message.reply('Could not update XP.');
          }
          const thresholds = [100, 300, 600];
          let newLevel = row ? row.level : 0;
          if (nextXp >= thresholds[2] && newLevel < 3) newLevel = 3;
          else if (nextXp >= thresholds[1] && newLevel < 2) newLevel = 2;
          else if (nextXp >= thresholds[0] && newLevel < 1) newLevel = 1;
          if (row && newLevel > row.level) {
            db.run(`UPDATE users SET level = ? WHERE id = ?`, [newLevel, target.id]);
            const roleName = newLevel === 3 ? 'Level 3 Yardie' : newLevel === 2 ? 'Level 2 Yardie' : 'Level 1 Yardie';
            ensureRole(message.guild, roleName).then(() => {
              const role = message.guild.roles.cache.find(r => r.name === roleName);
              if (role && !target.roles.cache.has(role.id)) {
                target.roles.add(role).catch(console.error);
                message.channel.send(`${target}, congrats! You leveled up to **${roleName}**! 🎉`);
              }
            });
          }
          message.channel.send(`✅ ${amount} XP added to ${target.user.tag}. New XP: **${nextXp}**`);
          const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
          if (logChannel) {
            const embed = new EmbedBuilder()
              .setTitle('➕ XP Added')
              .setDescription(
                `**User:** ${target.user.tag}\n` +
                `**Amount:** ${amount}\n` +
                `**New XP:** ${nextXp}\n` +
                `**By:** ${message.author.tag}`
              )
              .setColor(0x34d399)
              .setTimestamp();
            logChannel.send({ embeds: [embed] });
          }
        }
      );
    });
  }
};
