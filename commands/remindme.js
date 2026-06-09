// commands/remindme.js - Personal reminder system

module.exports = {
  name: 'remindme',
  aliases: ['remind', 'reminder'],
  description: 'Set a personal reminder',
  usage: '!remindme <time> <message>',
  
  async execute(message, args, db, EmbedBuilder) {
    try {
      if (args.length < 2) {
        return message.reply('❌ Usage: `!remindme <time> <message>`\nExamples:\n`!remindme 30m Check the oven`\n`!remindme 2h Meeting with team`\n`!remindme 1d Pay bills`');
      }
      
      const timeStr = args[0].toLowerCase();
      const reminderText = args.slice(1).join(' ');
      
      // Parse time
      const timeMatch = timeStr.match(/^(\d+)(m|h|d)$/);
      if (!timeMatch) {
        return message.reply('❌ Invalid time format! Use: 30m (minutes), 2h (hours), or 1d (days)');
      }
      
      const amount = parseInt(timeMatch[1]);
      const unit = timeMatch[2];
      
      let minutes;
      switch (unit) {
        case 'm': minutes = amount; break;
        case 'h': minutes = amount * 60; break;
        case 'd': minutes = amount * 60 * 24; break;
      }
      
      if (minutes < 1 || minutes > 10080) { // Max 7 days
        return message.reply('❌ Time must be between 1 minute and 7 days!');
      }
      
      const remindAt = new Date(Date.now() + minutes * 60 * 1000);
      
      // Store reminder
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO reminders (user_id, channel_id, message, remind_at, created_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [message.author.id, message.channel.id, reminderText, remindAt.toISOString()],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('⏰ Reminder Set!')
        .setDescription(`I'll remind you about: **${reminderText}**`)
        .addFields(
          { name: 'Time', value: `${amount}${unit === 'm' ? ' minute' : unit === 'h' ? ' hour' : ' day'}${amount > 1 ? 's' : ''}`, inline: true },
          { name: 'Remind At', value: `<t:${Math.floor(remindAt.getTime() / 1000)}:F>`, inline: false }
        )
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error in remindme command:', error);
      message.reply('❌ Error setting reminder.');
    }
  }
};
