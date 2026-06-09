const config = require('../config');
const { ensureRole, formatMessage } = require('../utils');

const voiceTimes = new Map();

module.exports = {
  name: 'voiceStateUpdate',
  execute(oldState, newState, db, logWithTimestamp) {
    const member = newState.member;
    const guild = newState.guild;
    if (!member || member.user.bot) return;

    const branding = config.branding || {};
    const firstVoiceRole = (config.voiceRoles && config.voiceRoles[0]) || {
      name: config.talkativeParrotRole,
      minutes: config.voiceRoleMinutes || 60
    };
    const generalChannelName = config.generalChannelName;

    if (firstVoiceRole && firstVoiceRole.name) {
      ensureRole(guild, firstVoiceRole.name);
    }
    const role = firstVoiceRole && firstVoiceRole.name
      ? guild.roles.cache.find(r => r.name === firstVoiceRole.name)
      : null;
    const generalChannel =
      guild.channels.cache.get(config.generalChannelId) ||
      guild.channels.cache.find(ch => ch.name === generalChannelName);

    if (!oldState.channelId && newState.channelId) {
      voiceTimes.set(member.id, Date.now());
    }

    if (oldState.channelId && !newState.channelId) {
      const joinTime = voiceTimes.get(member.id);
      if (!joinTime) return;
      const duration = (Date.now() - joinTime) / (1000 * 60);
      voiceTimes.delete(member.id);

      db.get(`SELECT * FROM users WHERE id = ?`, [member.id], (err, row) => {
        if (err) return logWithTimestamp(err);
        const newMinutes = row ? row.voiceMinutes + Math.floor(duration) : Math.floor(duration);
        db.run(`INSERT INTO users (id, username, xp, level, messages, voiceMinutes)
                VALUES (?, ?, 0, 0, 0, ?)
                ON CONFLICT(id) DO UPDATE SET voiceMinutes = ?`,
                [member.id, member.user.username, newMinutes, newMinutes]);
      });

      const minutesNeeded = (firstVoiceRole && firstVoiceRole.minutes) || 60;
      if (duration >= minutesNeeded && role && !member.roles.cache.has(role.id)) {
        member.roles.add(role).catch(console.error);
        if (generalChannel && branding.voiceRoleEarnedMessage) {
          generalChannel.send(
            formatMessage(branding.voiceRoleEarnedMessage, {
              emoji: '🦜',
              member: member.toString(),
              role: firstVoiceRole.name,
              minutes: minutesNeeded
            })
          );
        }
      }
    }
  }
};
