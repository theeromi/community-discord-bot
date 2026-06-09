// commands/rep.js - Reputation system for Dimandem Bot

module.exports = {
  name: 'rep',
  aliases: ['reputation', 'thanks', 'thank'],
  description: 'Give reputation points to helpful members (24-hour cooldown)',
  usage: '!rep @user [reason]',
  
  async execute(message, args, db, EmbedBuilder) {
    try {
      // Check if user mentioned someone
      const targetUser = message.mentions.users.first();
      
      if (!targetUser) {
        return message.reply('❌ Please mention a user to give reputation to! Usage: `!rep @user [reason]`');
      }
      
      if (targetUser.id === message.author.id) {
        return message.reply('❌ You can\'t give reputation to yourself!');
      }
      
      if (targetUser.bot) {
        return message.reply('❌ You can\'t give reputation to bots!');
      }
      
      // Get reason (optional)
      const reason = args.slice(1).join(' ') || 'Being helpful';
      
      // Check cooldown (24 hours per giver)
      const cooldownCheck = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM reputation_log WHERE giver_id = ? ORDER BY given_at DESC LIMIT 1`,
          [message.author.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (cooldownCheck) {
        const lastGiven = new Date(cooldownCheck.given_at);
        const now = new Date();
        const hoursSince = (now - lastGiven) / (1000 * 60 * 60);
        
        if (hoursSince < 24) {
          const hoursLeft = Math.ceil(24 - hoursSince);
          return message.reply(`⏰ You can give reputation again in **${hoursLeft} hours**!`);
        }
      }
      
      // Add reputation point
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO reputation (user_id, username, points)
           VALUES (?, ?, 1)
           ON CONFLICT(user_id) DO UPDATE SET
             points = points + 1,
             username = ?`,
          [targetUser.id, targetUser.username, targetUser.username],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Log the reputation given
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO reputation_log (giver_id, receiver_id, reason, given_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [message.author.id, targetUser.id, reason],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Get new total
      const newTotal = await new Promise((resolve, reject) => {
        db.get(
          `SELECT points FROM reputation WHERE user_id = ?`,
          [targetUser.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.points : 1);
          }
        );
      });
      
      const embed = new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle('⭐ Reputation Given!')
        .setDescription(`${message.author} gave reputation to ${targetUser}!`)
        .addFields(
          { name: 'Reason', value: reason, inline: false },
          { name: 'Total Reputation', value: `${newTotal} points`, inline: true }
        )
        .setFooter({ text: 'You can give reputation again in 24 hours' })
        .setTimestamp();
      
      await message.channel.send({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error in rep command:', error);
      message.reply('❌ Error giving reputation. Please try again later.');
    }
  }
};
