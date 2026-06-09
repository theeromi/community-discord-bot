const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { AuditLogger } = require('../auditLogger');

module.exports = {
  name: 'unmute',
  description: 'Unmute a user',
  usage: '!unmute @user [reason]',
  async execute(message, args, db, EmbedBuilder) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply('You do not have permission to unmute members.');
    }
    
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('Please mention a user to unmute.');
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    try {
      await member.timeout(null, reason);
      await message.channel.send(`${member.user.tag} has been unmuted.`);
      
      // Log to audit logger (database)
      const auditLogger = new AuditLogger(db);
      await auditLogger.logAction({
        guildId: message.guild.id,
        actionType: 'unmute',
        moderator: message.member,
        target: member,
        reason
      });
      
      // Also send to mod-logs channel if it exists
      const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🔊 User Unmuted')
          .setDescription(`**User:** ${member.user.tag} (${member.id})\n**Unmuted by:** ${message.author.tag} (${message.author.id})\n**Reason:** ${reason}`)
          .setColor(0x00ff00)
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Unmute command error:', err);
      await message.reply('Unable to unmute the member. Please check my permissions and the user\'s role hierarchy.');
    }
  }
};
