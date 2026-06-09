const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'backup',
  description: 'Create a manual backup of the database',
  usage: '!backup [reason]',
  permissions: ['admin'],
  async execute(message, args, db, EmbedBuilder) {
    try {
      const reason = args.join(' ') || 'Manual backup';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `dimandem_backup_${timestamp}.db`;
      const backupPath = path.join(__dirname, '..', backupFileName);

      // Create backup by copying the database file
      const dbPath = path.join(__dirname, '..', 'dimandem.db');

      // Check if database exists
      if (!fs.existsSync(dbPath)) {
        return message.reply('⚠️ Database file not found.');
      }

      // Copy the database file
      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(dbPath);
        const writeStream = fs.createWriteStream(backupPath);

        readStream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('close', resolve);

        readStream.pipe(writeStream);
      });

      // Get database stats
      let userCount = 0;
      let totalXP = 0;

      await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count, SUM(xp) as totalXP FROM users', (err, row) => {
          if (err) reject(err);
          else {
            userCount = row.count || 0;
            totalXP = row.totalXP || 0;
            resolve();
          }
        });
      });

      // Get file size
      const stats = fs.statSync(backupPath);
      const fileSizeKB = Math.round(stats.size / 1024);

      const embed = new EmbedBuilder()
        .setTitle('💾 Database Backup Created')
        .setColor('#2ecc71')
        .addFields(
          { name: '📁 Backup File', value: backupFileName, inline: true },
          { name: '📏 File Size', value: `${fileSizeKB} KB`, inline: true },
          { name: '⏰ Created', value: new Date().toLocaleString(), inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '📊 Database Stats', value: `Users: ${userCount}\nTotal XP: ${totalXP.toLocaleString()}`, inline: true },
          { name: '✅ Status', value: 'Backup completed successfully', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Database Backup' });

      await message.reply({ embeds: [embed] });

      // Log the backup creation
      console.log(`[BACKUP] Database backup created: ${backupFileName} (${fileSizeKB} KB) - Reason: ${reason}`);

    } catch (error) {
      console.error('Backup command error:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Backup Failed')
        .setColor('#e74c3c')
        .setDescription(`Error creating database backup: ${error.message}`)
        .setTimestamp();

      return message.reply({ embeds: [errorEmbed] });
    }
  }
};