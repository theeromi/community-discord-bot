// commands/ban.js
// Handles the !ban command for Dimandem Bot

const { AuditLogger } = require('../auditLogger');

module.exports = {
  name: 'ban',
  description: 'Ban a user (admin only).',
  async execute(message, args, db, EmbedBuilder) {
    if (!message.member.permissions.has('Administrator')) {
      return message.reply('Only admins can use this command.');
    }
    if (!message.guild.members.me.permissions.has('BanMembers')) {
      return message.reply("I don't have permission to do that!");
    }
    
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('Please mention a user to ban.');
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    try {
      await member.ban({ reason });
      await message.channel.send(`${member.user.tag} has been banned.`);
      
      // Log to audit logger (database)
      const auditLogger = new AuditLogger(db);
      await auditLogger.logBan(message.guild, message.member, member, reason);
      
      // Also send to mod-logs channel if it exists
      const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🔨 User Banned')
          .setDescription(`**User:** ${member.user.tag} (${member.id})\n**Banned by:** ${message.author.tag} (${message.author.id})\n**Reason:** ${reason}`)
          .setColor(0xff0000)
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Ban command error:', err);
      await message.reply('I was unable to ban the member. Please check my permissions and the user\'s role hierarchy.');
    }
  }
};
