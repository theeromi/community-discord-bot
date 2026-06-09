const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'setbirthday',
  description: 'Set your birthday (format: YYYY-MM-DD). Example: !setbirthday 2000-05-21',
  async execute(message, args, db) {
    if (!args[0]) {
      return message.reply('❗ Please provide your birthday in the format YYYY-MM-DD. Example: `!setbirthday 2000-05-21`');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(args[0])) {
      return message.reply('❗ Invalid format. Please use YYYY-MM-DD. Example: `!setbirthday 2000-05-21`');
    }

    const birthday = args[0];
    const userId = message.author.id;

    db.run(
      `UPDATE users SET birthday = ? WHERE id = ?`,
      [birthday, userId],
      function (err) {
        if (err) {
          return message.reply('⚠️ There was an error saving your birthday.');
        }
        if (this.changes === 0) {
          // User not in DB yet, insert
          db.run(
            `INSERT INTO users (id, username, birthday) VALUES (?, ?, ?)`,
            [userId, message.author.username, birthday],
            (err2) => {
              if (err2) {
                return message.reply('⚠️ There was an error saving your birthday.');
              }
              message.reply(`🎉 Your birthday has been set to **${birthday}**!`);
            }
          );
        } else {
          message.reply(`🎉 Your birthday has been updated to **${birthday}**!`);
        }
      }
    );
  }
};