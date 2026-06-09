const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { formatCurrency } = require('../utils');

// Simple promisify function for database operations
function promisifyDB(db) {
  return {
    get: (sql, params) => new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    }),
    run: (sql, params) => new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    })
  };
}

// Store active challenges globally
const activeTestChallenges = new Map(); // channelId -> { answer, startTime, question }

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
  name: 'dailytest',
  aliases: ['trivia', 'challenge', 'quiz'],
  description: 'Start a daily trivia challenge (test) - Rate limited for regular users',
  usage: '!dailytest (or !trivia)',

  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    const channel = message.channel;
    const channelId = channel.id;
    const userId = message.author.id;

    try {
      // Check if user has elevated permissions (skip rate limiting for mods/admins)
      if (!hasElevatedPermissions(message.member)) {
        const rateLimitResult = checkRateLimit(userId);

        if (!rateLimitResult.allowed) {
          return channel.send(
            `⏳ **Rate Limited!** You can only use this command ${RATE_LIMIT_MAX} times every 4 hours.\n` +
            `Try again in **${rateLimitResult.timeLeft} minutes**.`
          );
        }

        // Notify remaining uses
        if (rateLimitResult.remaining === 0) {
          channel.send(`⚠️ This was your last use of !dailytest for the next 4 hours.`);
        } else if (rateLimitResult.remaining <= 1) {
          channel.send(`⚠️ You have ${rateLimitResult.remaining} use left for the next 4 hours.`);
        }
      }

      // Check if there's already an active challenge in this channel
      if (activeTestChallenges.has(channelId)) {
        return channel.send('⚠️ There\'s already an active trivia challenge in this channel!');
      }

      // Load trivia questions
      const triviaPath = path.join(__dirname, '..', 'questions.json');
      let trivia = [];

      try {
        const data = fs.readFileSync(triviaPath, 'utf8');
        trivia = JSON.parse(data);
      } catch (err) {
        return channel.send('⚠️ Could not load trivia questions. Please check if questions.json exists.');
      }

      if (trivia.length === 0) {
        return channel.send('⚠️ No trivia questions available in questions.json.');
      }

      // Get random question
      const random = trivia[Math.floor(Math.random() * trivia.length)];

      // Validate the question has required fields
      if (!random || !random.question || !random.answer) {
        console.error('Invalid trivia question:', random);
        return channel.send('⚠️ Invalid trivia question in questions.json. Please check the format.');
      }

      // Store the active challenge
      activeTestChallenges.set(channelId, {
        answer: String(random.answer).toLowerCase().trim(),
        startTime: Date.now(),
        question: random.question,
        winner: null,
        winnerName: null
      });

      const embed = new EmbedBuilder()
        .setTitle('🎉 Daily Challenge Test!')
        .setDescription(`${random.question}\n\nFirst person to answer correctly wins 100 XP!`)
        .setColor(0x00AE86)
        .setFooter({ text: 'Answer by typing your response in chat • Challenge expires in 30 seconds' });

      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        console.error('Error sending daily test embed:', err);
        activeTestChallenges.delete(channelId);
        return channel.send('⚠️ An error occurred while starting the daily challenge test.');
      }

      // Log the correct answer for moderators
      console.log(`Daily test started in ${channel.name}: Answer is "${random.answer}"`);

      // Set timeout to end challenge with error handling
      setTimeout(async () => {
        try {
          const challenge = activeTestChallenges.get(channelId);
          if (challenge && !challenge.winner) {
            activeTestChallenges.delete(channelId);
            try {
              await channel.send('⏰ Time\'s up! Nobody answered the daily challenge correctly.');
            } catch (err) {
              console.error('Error sending timeout message:', err);
            }
            console.log(`Daily test in ${channel.name} expired with no winner`);
          }
        } catch (err) {
          console.error('Error in daily test timeout handler:', err);
        }
      }, 30000); // 30 seconds

    } catch (error) {
      console.error('Daily test error:', error);
      return channel.send('⚠️ An error occurred while starting the daily challenge test.');
    }
  },

  // Function to check answers (called from message handler)
  async checkAnswer(message, db, EmbedBuilder, economySystem) {
    // Safety check: ensure message object has required properties
    if (!message || !message.channel || !message.author || !message.content) {
      return false;
    }

    const channelId = message.channel.id;
    const challenge = activeTestChallenges.get(channelId);

    // No active challenge or already has a winner
    if (!challenge || challenge.winner) return false;

    const userAnswer = message.content.toLowerCase().trim();
    const correctAnswer = challenge.answer;

    // Check if answer matches (exact or close match)
    // Improved matching logic
    const isCorrect = userAnswer === correctAnswer ||
                     (correctAnswer.includes(userAnswer) && userAnswer.length > 2) ||
                     (userAnswer.includes(correctAnswer) && correctAnswer.length > 2) ||
                     // Check for partial matches with reasonable length
                     (userAnswer.length >= 3 && correctAnswer.includes(userAnswer)) ||
                     (correctAnswer.length >= 3 && userAnswer.includes(correctAnswer));

    if (!isCorrect) {
      return false;
    }

    // Double-check challenge still exists and doesn't have a winner (race condition protection)
    const currentChallenge = activeTestChallenges.get(channelId);
    if (!currentChallenge || currentChallenge.winner) {
      // Already won, but don't crash - just acknowledge
      try {
        await message.channel.send(`💡 <@${message.author.id}>, that's correct but someone already got it! Better luck next time! 🎯`).catch(() => {});
      } catch (e) {
        // Silently fail if channel send fails
      }
      return true;
    }

    // Mark winner FIRST to prevent other answers from claiming victory
    currentChallenge.winner = message.author.id;
    currentChallenge.winnerName = message.author.displayName || message.author.username;

    try {
      const dbAsync = promisifyDB(db);

      // Award XP
      let user;
      try {
        user = await dbAsync.get('SELECT * FROM users WHERE id = ?', [message.author.id]);
      } catch (err) {
        console.error('Error fetching user for daily test XP award:', err);
        user = null;
      }

      const currentXP = user ? user.xp : 0;
      const newXP = currentXP + 100;

      try {
        await dbAsync.run(`
          INSERT INTO users (id, username, xp, level, messages, voiceMinutes)
          VALUES (?, ?, ?, 0, 0, 0)
          ON CONFLICT(id) DO UPDATE SET xp = ?, username = ?
        `, [message.author.id, message.author.username, newXP, newXP, message.author.username]);
      } catch (err) {
        console.error('Error updating XP for daily test:', err);
      }
      
      // Award currency for winning trivia (default: 50)
      let currencyAwarded = 0;
      try {
        // economySystem is passed as 4th parameter to checkAnswer
        if (economySystem && economySystem.initialized) {
          await economySystem.addMoney(message.author.id, 50, 'Won daily trivia challenge');
          currencyAwarded = 50;
        }
      } catch (err) {
        console.error('Error awarding currency for daily test:', err);
      }

      // Track trivia wins and money earned for achievements
      try {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO achievement_stats (user_id, trivia_wins, money_earned) VALUES (?, 1, ?)
             ON CONFLICT(user_id) DO UPDATE SET trivia_wins = trivia_wins + 1, money_earned = money_earned + ?`,
            [message.author.id, currencyAwarded, currencyAwarded],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      } catch (err) {
        console.error('Error tracking trivia achievement stats:', err);
      }

      // Congratulate winner with null-safety for displayAvatarURL
      const displayName = message.author.displayName || message.author.username || 'Unknown';
      const avatarURL = typeof message.author.displayAvatarURL === 'function' 
        ? message.author.displayAvatarURL() 
        : undefined;

      const rewardText = currencyAwarded > 0
        ? `**Reward:** +100 XP & ${formatCurrency(currencyAwarded, config)} 💰`
        : `**Reward:** +100 XP`;

      const winEmbed = new EmbedBuilder()
        .setTitle('🎉 Correct Answer!')
        .setDescription(`**${displayName}** got it right!\n\n**Answer:** ${challenge.answer}\n${rewardText}`)
        .setColor(0x00ff00);

      if (avatarURL) {
        winEmbed.setThumbnail(avatarURL);
      }

      // Send messages with error handling
      try {
        await message.channel.send({ embeds: [winEmbed] }).catch(err => {
          console.error('Error sending win embed:', err);
        });
      } catch (e) {
        console.error('Error sending win embed (outer):', e);
      }

      try {
        await message.channel.send(`🏆 **${displayName}** has won today's daily challenge! Better luck next time everyone! 🎯`).catch(err => {
          console.error('Error sending victory notification:', err);
        });
      } catch (e) {
        console.error('Error sending victory notification (outer):', e);
      }

      console.log(`Daily test won by ${message.author.username} with answer: "${userAnswer}"`);

      // Clean up challenge after a short delay to catch duplicate answers
      // Use setTimeout but wrap in try-catch to prevent crashes
      setTimeout(() => {
        try {
          activeTestChallenges.delete(channelId);
        } catch (err) {
          console.error('Error cleaning up daily test challenge:', err);
        }
      }, 5000); // 5 seconds delay

      return true;

    } catch (error) {
      console.error('Error awarding XP for daily test:', error);
      try {
        await message.channel.send(`🎉 Correct! But there was an error awarding XP.`).catch(() => {});
      } catch (e) {
        console.error('Error sending error message:', e);
      }
      return true;
    }
  }
};

// Export the active challenges map for cleanup if needed
module.exports.activeTestChallenges = activeTestChallenges;
