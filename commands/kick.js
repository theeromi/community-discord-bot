// commands/kick.js
// Handles the !kick command for Dimandem Bot

const { AuditLogger } = require('../auditLogger');

module.exports = {
  name: 'kick',
  description: 'Kick a user (moderator+).',
  async execute(message, args, db, EmbedBuilder) {
    if (!message.member || !message.member.permissions.has('KickMembers')) {
      return message.reply('You do not have permission to kick.');
    }
    if (!message.guild.members.me.permissions.has('KickMembers')) {
      return message.reply("I don't have permission to do that!");
    }
    
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('Please mention a user to kick.');
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    try {
      await member.kick(reason);
      await message.channel.send(`${member.user.tag} has been kicked.`);
      
      // Log to audit logger (database)
      const auditLogger = new AuditLogger(db);
      await auditLogger.logKick(message.guild, message.member, member, reason);
      
      // Also send to mod-logs channel if it exists
      const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('👢 User Kicked')
          .setDescription(`**User:** ${member.user.tag} (${member.id})\n**Kicked by:** ${message.author.tag} (${message.author.id})\n**Reason:** ${reason}`)
          .setColor(0xffa500)
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Kick command error:', err);
      await message.reply('I was unable to kick the member. Please check my permissions and the user\'s role hierarchy.');
    }
  }
};
