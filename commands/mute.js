const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { AuditLogger } = require('../auditLogger');

module.exports = {
  name: 'mute',
  description: 'Mute a user for 10 minutes',
  usage: '!mute @user [reason]',
  async execute(message, args, db, EmbedBuilder) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply('You do not have permission to mute members.');
    }
    
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply('Please mention a user to mute.');
    }
    
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const muteTime = 10 * 60 * 1000; // 10 minutes
    const expiresAt = new Date(Date.now() + muteTime);
    
    try {
      await member.timeout(muteTime, reason);
      await message.channel.send(`${member.user.tag} has been muted for 10 minutes.`);
      
      // Log to audit logger (database)
      const auditLogger = new AuditLogger(db);
      await auditLogger.logMute(message.guild, message.member, member, reason, expiresAt.toISOString());
      
      // Also send to mod-logs channel if it exists
      const logChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🔇 User Muted')
          .setDescription(`**User:** ${member.user.tag} (${member.id})\n**Muted by:** ${message.author.tag} (${message.author.id})\n**Duration:** 10 minutes\n**Reason:** ${reason}`)
          .setColor(0x800080)
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Mute command error:', err);
      await message.reply('Unable to mute the member. Please check my permissions and the user\'s role hierarchy.');
    }
  }
};
