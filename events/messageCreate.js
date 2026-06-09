const config = require('../config');
const { ensureRole, formatMessage } = require('../utils');

module.exports = {
  name: 'messageCreate',
  async execute(message, client, db, trivia, dailyChallengeActive, cooldowns, logWithTimestamp, errorWithTimestamp) {
    if (!message.guild || message.author.bot) return;

    const branding = config.branding || {};
    const levelRoles = config.levelRoles || [];
    const thresholds = config.levelThresholds || [];

    // Ensure level roles exist (only the first three for the legacy quick-path)
    try {
      for (let i = 0; i < Math.min(3, levelRoles.length); i++) {
        if (levelRoles[i]) await ensureRole(message.guild, levelRoles[i]);
      }
    } catch (error) {
      errorWithTimestamp('Error ensuring roles exist:', error);
    }

    // Award 1-3 XP per message with cooldown
    const userId = message.author.id;

    if (!cooldowns.has(userId)) { // 1 minute cooldown per user
      cooldowns.add(userId);
      setTimeout(() => cooldowns.delete(userId), 60000);

      const randomXP = Math.floor(Math.random() * 3) + 1; // 1-3 XP

      db.get(`SELECT xp, level FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err) {
          errorWithTimestamp('Error getting user data for XP award:', err);
          return;
        }

        const currentXp = row ? row.xp : 0;
        const currentLevel = row ? row.level : 0;
        const newXp = currentXp + randomXP;

        db.run(`INSERT INTO users (id, username, xp, level, messages, voiceMinutes)
                VALUES (?, ?, ?, ?, 1, 0)
                ON CONFLICT(id) DO UPDATE SET
                  xp = xp + ?,
                  messages = messages + 1,
                  username = ?`,
                [userId, message.author.username, newXp, currentLevel, randomXP, message.author.username],
                function(err) {
                  if (err) {
                    errorWithTimestamp('Error updating user XP:', err);
                    return;
                  }

                  // Check level up using the first three thresholds (legacy path)
                  let newLevel = currentLevel;
                  for (let i = Math.min(2, thresholds.length - 1); i >= 0; i--) {
                    if (newXp >= thresholds[i] && currentLevel < (i + 1)) {
                      newLevel = i + 1;
                      break;
                    }
                  }

                  if (newLevel > currentLevel) {
                    db.run(`UPDATE users SET level = ? WHERE id = ?`, [newLevel, userId], (err) => {
                      if (err) {
                        errorWithTimestamp('Error updating user level:', err);
                        return;
                      }

                      const roleName = levelRoles[newLevel - 1];
                      if (!roleName) return;

                      const role = message.guild.roles.cache.find(r => r.name === roleName);
                      if (role && message.member && !message.member.roles.cache.has(role.id)) {
                        message.member.roles.add(role).then(() => {
                          if (branding.levelUpMessage) {
                            message.channel.send(
                              formatMessage(branding.levelUpMessage, {
                                member: message.author.toString(),
                                role: roleName,
                                boostEmoji: ''
                              })
                            );
                          }
                          logWithTimestamp(`User ${message.author.tag} leveled up to ${roleName} (XP: ${newXp})`);
                        }).catch(error => {
                          errorWithTimestamp('Error assigning level role:', error);
                        });
                      }
                    });
                  }
                });
      });
    }
  }
};
