// commands/afk.js - AFK status system

module.exports = {
  name: 'afk',
  description: 'Set yourself as AFK with an optional message',
  usage: '!afk [message]',
  
  async execute(message, args, db, EmbedBuilder) {
    try {
      const afkMessage = args.join(' ') || 'AFK';
      const userId = message.author.id;
      
      // Set AFK status
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO afk_status (user_id, username, message, set_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
             message = ?,
             set_at = CURRENT_TIMESTAMP`,
          [userId, message.author.username, afkMessage, afkMessage],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('💤 AFK Status Set')
        .setDescription(`${message.author} is now AFK`)
        .addFields({ name: 'Message', value: afkMessage })
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error in afk command:', error);
      message.reply('❌ Error setting AFK status.');
    }
  }
};
