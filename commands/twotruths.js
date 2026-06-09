// commands/twotruths.js
// Handles the !twotruths command for Dimandem Bot

const fs = require('fs');
const path = require('path');

// Rate limiting storage: userId -> { count, resetTime }
const userRateLimits = new Map();

// Rate limiting constants
const RATE_LIMIT_MAX = 3; // Max uses per period
const RATE_LIMIT_PERIOD = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

// Check if user has elevated permissions (mod/admin/dev)
function hasElevatedPermissions(member) {
  if (!member) return false;

  // Check for common admin/mod permissions
  return member.permissions.has('ManageGuild') ||
         member.permissions.has('Administrator') ||
         member.permissions.has('ManageMessages') ||
         member.permissions.has('BanMembers') ||
         member.permissions.has('KickMembers');
}

// Check and update rate limit for user
function checkRateLimit(userId) {
  const now = Date.now();
  const userLimit = userRateLimits.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    // First use or period expired, reset
    userRateLimits.set(userId, { count: 1, resetTime: now + RATE_LIMIT_PERIOD });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    // Rate limit exceeded
    const timeLeft = Math.ceil((userLimit.resetTime - now) / (60 * 1000)); // minutes
    return { allowed: false, timeLeft };
  }

  // Increment counter
  userLimit.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - userLimit.count };
}

module.exports = {
  name: 'twotruths',
  description: 'Play Two Truths and a Lie for XP - Rate limited for regular users',
  async execute(message, args, db, EmbedBuilder) {
    const userId = message.author.id;

    // Check if user has elevated permissions (skip rate limiting for mods/admins)
    if (!hasElevatedPermissions(message.member)) {
      const rateLimitResult = checkRateLimit(userId);

      if (!rateLimitResult.allowed) {
        return message.channel.send(
          `⏳ **Rate Limited!** You can only use this command ${RATE_LIMIT_MAX} times every 4 hours.\n` +
          `Try again in **${rateLimitResult.timeLeft} minutes**.`
        );
      }

      // Notify remaining uses
      if (rateLimitResult.remaining === 0) {
        message.channel.send(`⚠️ This was your last use of !twotruths for the next 4 hours.`);
      } else if (rateLimitResult.remaining <= 1) {
        message.channel.send(`⚠️ You have ${rateLimitResult.remaining} use left for the next 4 hours.`);
      }
    }

    const truthsPath = path.join(__dirname, '../twotruths.json');
    try {
      const data = fs.readFileSync(truthsPath, 'utf8');
      const allTruths = JSON.parse(data);

      if (allTruths.length === 0) return message.channel.send('⚠️ No statements available.');

      const randomSet = allTruths[Math.floor(Math.random() * allTruths.length)];
      const { statements, lieIndex } = randomSet;

      if (!Array.isArray(statements) || statements.length !== 3 || typeof lieIndex !== 'number' || lieIndex < 0 || lieIndex >= statements.length) {
        return message.channel.send('⚠️ Invalid set of statements. Please check the twotruths.json file.');
      }

      const shuffled = statements
        .map((s, idx) => ({ text: s, isLie: idx === lieIndex }))
        .sort(() => Math.random() - 0.5);

      const correctIndex = shuffled.findIndex(s => s.isLie);

      message.channel.send(
        `🤔 **Two Truths and a Lie!** 🤔\n` +
        `Can you guess the lie?\n\n` +
        `1️⃣ ${shuffled[0].text}\n` +
        `2️⃣ ${shuffled[1].text}\n` +
        `3️⃣ ${shuffled[2].text}\n\n` +
        `Reply with \`1\`, \`2\`, or \`3\` to guess the lie!`
      );

      const filter = m => {
        return ['1', '2', '3'].includes(m.content) && !m.author.bot && m.channel.id === message.channel.id;
      };

      message.channel.awaitMessages({
        filter,
        max: 1,
        time: 30000,
        errors: ['time']
      }).then(async (collected) => {
        const m = collected.first();
        if (parseInt(m.content) - 1 === correctIndex) {
          // Increment XP and message count for Two Truths wins
          db.run(`INSERT INTO users (id, username, xp, level, messages, voiceMinutes)
                  VALUES (?, ?, 50, 0, 1, 0)
                  ON CONFLICT(id) DO UPDATE SET xp = xp + 50, messages = messages + 1`,
                  [m.author.id, m.author.username], function(err) {
            if (err) return;
            // After update, fetch user's XP and level to check for level up
            db.get(`SELECT xp, level FROM users WHERE id = ?`, [m.author.id], async (err, row) => {
              if (err || !row) return;
              const levelThresholds = [100, 300, 600];
              let leveledUp = false;
              let newLevel = row.level;

              if (row.xp >= levelThresholds[2] && row.level < 3) {
                db.run(`UPDATE users SET level = 3 WHERE id = ?`, [m.author.id]);
                leveledUp = 'Level 3 Yardie';
                newLevel = 3;
              } else if (row.xp >= levelThresholds[1] && row.level < 2) {
                db.run(`UPDATE users SET level = 2 WHERE id = ?`, [m.author.id]);
                leveledUp = 'Level 2 Yardie';
                newLevel = 2;
              } else if (row.xp >= levelThresholds[0] && row.level < 1) {
                db.run(`UPDATE users SET level = 1 WHERE id = ?`, [m.author.id]);
                leveledUp = 'Level 1 Yardie';
                newLevel = 1;
              }
              if (leveledUp) {
                const member = m.guild.members.cache.get(m.author.id);
                if (member) {
                  const { ensureRole } = require('../utils');
                  ensureRole(m.guild, leveledUp).then(() => {
                    const role = m.guild.roles.cache.find(r => r.name === leveledUp);
                    if (role && !member.roles.cache.has(role.id)) {
                      member.roles.add(role).catch(() => {});
                      message.channel.send(`${member}, congrats! You leveled up to **${leveledUp}**! 🎉`);
                    }
                  });
                }
              }
            });
          });

          await message.channel.send(`✅ Correct! You found the lie and earned 50 XP!`);
        } else {
          await message.channel.send(`❌ Nope! That wasn't the lie. Better luck next time.`);
        }
      }).catch(async () => {
        await message.channel.send('⏰ Time\'s up! Nobody guessed the lie.');
      });

    } catch (err) {
      message.channel.send('⚠️ Unable to load statements right now.');
    }
  }
};
