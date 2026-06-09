const config = require('../config');
const { ensureRole, formatMessage } = require('../utils');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client, db, trivia, cooldowns, logWithTimestamp, errorWithTimestamp) {
    const branding = config.branding || {};
    const generalChannelName = config.generalChannelName;
    const rulesChannelName = config.rulesChannelName;
    const firstLevelRole = (config.levelRoles && config.levelRoles[0]) || config.level1YardieRole;

    if (firstLevelRole) {
      ensureRole(member.guild, firstLevelRole);
    }

    const generalChannel =
      member.guild.channels.cache.get(config.generalChannelId) ||
      member.guild.channels.cache.find(ch => ch.name === generalChannelName);
    const rulesChannel = member.guild.channels.cache.find(ch => ch.name === rulesChannelName);
    const rulesRef = rulesChannel ? rulesChannel.toString() : `\`#${rulesChannelName}\``;

    if (generalChannel && branding.welcomeChannelMessage) {
      generalChannel.send(
        formatMessage(branding.welcomeChannelMessage, {
          member: member.toString(),
          guild: member.guild.name,
          rulesChannel: rulesRef
        })
      );
    }

    if (branding.welcomeDM) {
      member.send(
        formatMessage(branding.welcomeDM, {
          username: member.user.username,
          guild: member.guild.name,
          rulesChannel: rulesRef,
          generalChannel: generalChannelName
        })
      ).catch(() => {
        errorWithTimestamp(`Could not send welcome DM to ${member.user.tag}.`);
      });
    }

    if (firstLevelRole) {
      ensureRole(member.guild, firstLevelRole).then(role => {
        if (role) {
          member.roles.add(role).catch(err => console.error(`Failed to assign role: ${err}`));
        }
      });
    }

    const joinDate = new Date().toISOString();
    db.run(
      `INSERT INTO users (id, username, xp, level, messages, voiceMinutes, joinDate)
       VALUES (?, ?, 0, 0, 0, 0, ?)
       ON CONFLICT(id) DO UPDATE SET joinDate = ?`,
      [member.id, member.user.username, joinDate, joinDate]
    );
  }
};
