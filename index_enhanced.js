// === Enhanced Dimandem Bot Main Entry ===
// Discord bot for XP, trivia, moderation, and fun commands
// Now with comprehensive error handling, validation, monitoring, and more

// --- Core Imports ---
require('dotenv').config();                           // Load environment variables first
const { logWithTimestamp, errorWithTimestamp } = require('./logger'); // Import logger early

// === Global Error Handling ===
process.on('uncaughtException', (err) => {
  errorWithTimestamp('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  errorWithTimestamp('Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- External Dependencies ---
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const schedule = require('node-schedule');
const { OpenAI } = require('openai');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// --- Internal Modules ---
const config = require('./config');
const { promisifyDB } = require('./errorHandler');
const { Validator } = require('./validation');
const { RateLimiter } = require('./rateLimiter');
const { BackupManager } = require('./backupManager');
const { CodeBackupManager } = require('./codeBackupManager');
const { PermissionManager } = require('./permissions');
const { AuditLogger } = require('./auditLogger');
const { ConfigValidator } = require('./configValidator');
const { HealthMonitor } = require('./healthMonitor');
const { ShutdownManager } = require('./shutdownManager');
const { Analytics } = require('./analytics');
const { TempPunishmentManager } = require('./tempPunishments');
const { MigrationManager } = require('./migrations');
const { BotCache } = require('./cache');
const EconomySystem = require('./economy');
const { ensureRole, formatMessage, currencyDisplay, getPrimaryGuild } = require('./utils');
const { NewsFeed } = require('./newsFeed');

// --- Initialize Core Systems ---
const configValidator = new ConfigValidator();
const validationResult = configValidator.validateAll();

if (!validationResult.success) {
  errorWithTimestamp('Configuration validation failed:', validationResult.errors);
  process.exit(1);
}

// --- Database Setup ---
const dbPath = process.env.DB_PATH || './dimandem.db';
const db = new sqlite3.Database(dbPath);
const dbAsync = promisifyDB(db);

// --- Discord Client Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// --- Discord Client Error Handlers ---
client.on('error', (error) => {
  errorWithTimestamp('Discord client error:', error);
});

client.on('shardError', (error, shardId) => {
  errorWithTimestamp(`Shard ${shardId} WebSocket error:`, error);
});

client.on('shardDisconnect', (event, shardId) => {
  logWithTimestamp(`Shard ${shardId} disconnected (code: ${event.code}). Discord.js will attempt to reconnect...`);
});

client.on('shardReconnecting', (shardId) => {
  logWithTimestamp(`Shard ${shardId} reconnecting...`);
});

client.on('shardResume', (shardId, replayedEvents) => {
  logWithTimestamp(`Shard ${shardId} resumed. Replayed ${replayedEvents} events.`);
});

client.on('warn', (warning) => {
  logWithTimestamp('Discord client warning:', warning);
});

// --- Initialize Enhancement Systems ---
const rateLimiter = new RateLimiter();
const backupManager = new BackupManager(dbPath, process.env.BACKUP_DIR || './backups');
const codeBackupManager = new CodeBackupManager('./code-backups');
const permissionManager = new PermissionManager();
const auditLogger = new AuditLogger(db, client);
const analytics = new Analytics(db);
const migrationManager = new MigrationManager(db);
const cache = new BotCache();
const economySystem = new EconomySystem(db);
let healthMonitor;
let shutdownManager;
let tempPunishmentManager;
let newsFeed = null;

// --- OpenAI Setup ---
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// --- Command Loader (Enhanced) ---
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(`./commands/${file}`);
    
    if (!command.name || typeof command.execute !== 'function') {
      errorWithTimestamp(`Invalid command structure in ${file}`);
      continue;
    }
    
    // Wrap command execution with error handling and rate limiting
    const originalExecute = command.execute;
    command.execute = async (message, args, db, EmbedBuilder, ...additionalArgs) => {
      const commandStartTime = Date.now();

      try {
        // Rate limiting - check global limit first, then command limit
        const userId = message.author.id;
        const commandName = command.name;
        
        // Check if user has elevated permissions (mod/admin) - skip rate limiting for them
        const hasElevatedPerms = message.member && (
          message.member.permissions.has('ManageGuild') ||
          message.member.permissions.has('Administrator') ||
          message.member.permissions.has('ManageMessages') ||
          message.member.permissions.has('BanMembers') ||
          message.member.permissions.has('KickMembers')
        );
        
        // Commands with their own rate limiting (like dailytest) should handle it internally
        // Skip global rate limiting for dailytest/trivia/quiz since it has its own 4-hour limit
        const hasInternalRateLimit = ['dailytest', 'trivia', 'quiz', 'challenge'].includes(commandName);
        
        // Only apply global rate limiting if user doesn't have elevated perms AND command doesn't have internal rate limiting
        if (!hasElevatedPerms && !hasInternalRateLimit) {
          try {
            // Check global rate limit (30 per minute)
            rateLimiter.checkGlobalLimit(userId);
            
            // Check command-specific rate limit (5 per minute default)
            rateLimiter.checkCommandLimit(userId, commandName);
          } catch (rateLimitError) {
            // Rate limit exceeded - return error message
            if (rateLimitError.message) {
              return message.reply(`⏳ ${rateLimitError.message}`).catch(() => {});
            }
            return message.reply('⏳ Rate limit exceeded. Please try again later.').catch(() => {});
          }
        }
        
        // Execute original command - pass through all additional args (context object, etc.)
        await originalExecute(message, args, db, EmbedBuilder, ...additionalArgs);

        const duration = Date.now() - commandStartTime;

        // Record health monitor metrics (best-effort; never break command flow)
        if (healthMonitor) {
          healthMonitor.recordCommand(commandName, duration, true);
        }
        
        // Record analytics (handle errors silently to not break command execution)
        try {
          await analytics.recordCommand(
            commandName,
            userId,
            message.guild?.id,
            message.channel?.id,
            duration,
            true
          );
        } catch (analyticsError) {
          // Silently handle analytics errors - don't break command execution
          errorWithTimestamp('Failed to record command analytics:', analyticsError);
        }
        
      } catch (error) {
        // Don't double-handle rate limit errors
        if (error.type === 'RATE_LIMIT' || error.code === 'RATE_LIMIT') {
          return; // Already handled above
        }

        if (healthMonitor) {
          const duration = Date.now() - commandStartTime;
          healthMonitor.recordCommand(command.name, duration, false);
        }
        
        errorWithTimestamp(`Command ${command.name} error:`, error);
        if (!message.deleted) {
          message.reply('⚠️ An error occurred while executing this command.').catch(() => {});
        }
      }
    };
    
    client.commands.set(command.name, command);
    
    // Register aliases if they exist
    if (command.aliases && Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        client.commands.set(alias, command);
      }
    }
    
    logWithTimestamp(`Loaded command: ${command.name}`);
  } catch (error) {
    errorWithTimestamp(`Failed to load command ${file}:`, error);
  }
}

// --- Trivia Loading ---
async function loadTrivia() {
  try {
    const triviaPath = path.join(__dirname, 'questions.json');
    const data = fs.readFileSync(triviaPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    errorWithTimestamp('Failed to load trivia questions:', error);
    return [];
  }
}

let trivia = [];
const cooldowns = new Set();

// --- Phase 3 Helper Functions ---

// Check and send due reminders
async function checkReminders() {
  try {
    const now = new Date().toISOString();
    const dueReminders = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM reminders WHERE remind_at <= ? AND reminded = 0`,
        [now],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    for (const reminder of dueReminders) {
      try {
        const channel = await client.channels.fetch(reminder.channel_id);
        const user = await client.users.fetch(reminder.user_id);

        const embed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle('⏰ Reminder!')
          .setDescription(reminder.message)
          .setFooter({ text: `Set ${Math.floor((Date.now() - new Date(reminder.created_at).getTime()) / 60000)} minutes ago` })
          .setTimestamp();

        await channel.send({ content: `${user}`, embeds: [embed] });

        // Mark as reminded
        await new Promise((resolve, reject) => {
          db.run(
            `UPDATE reminders SET reminded = 1 WHERE id = ?`,
            [reminder.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      } catch (error) {
        errorWithTimestamp(`Failed to send reminder ${reminder.id}:`, error);
      }
    }
  } catch (error) {
    errorWithTimestamp('Reminder check error:', error);
  }
}

// Clean up old reminders to keep the table size manageable
async function cleanupOldReminders() {
  try {
    const remindedCutoff = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
    const staleUnremindedCutoff = new Date(Date.now() - (14 * 24 * 60 * 60 * 1000)).toISOString();

    const deletedCount = await new Promise((resolve, reject) => {
      db.run(
        `DELETE FROM reminders
         WHERE (reminded = 1 AND remind_at <= ?)
            OR (reminded = 0 AND remind_at <= ?)`,
        [remindedCutoff, staleUnremindedCutoff],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes || 0);
        }
      );
    });

    logWithTimestamp(`Reminder cleanup completed. Removed ${deletedCount} old reminders.`);
  } catch (error) {
    errorWithTimestamp('Reminder cleanup failed:', error);
  }
}

// Check and end expired giveaways
async function checkGiveaways() {
  try {
    const now = new Date().toISOString();
    const expiredGiveaways = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM giveaways WHERE end_time <= ? AND ended = 0`,
        [now],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    for (const giveaway of expiredGiveaways) {
      try {
        const channel = await client.channels.fetch(giveaway.channel_id);
        const giveawayMessage = await channel.messages.fetch(giveaway.message_id);

        const reaction = giveawayMessage.reactions.cache.get('🎉');
        if (reaction && reaction.count > 1) {
          const users = await reaction.users.fetch();
          const entries = users.filter(u => !u.bot);

          if (entries.size > 0) {
            const winner = entries.random();

            // Update database
            await new Promise((resolve, reject) => {
              db.run(
                `UPDATE giveaways SET ended = 1, winner_id = ? WHERE id = ?`,
                [winner.id, giveaway.id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });

            // Update message
            const winnerEmbed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle('🎉 GIVEAWAY ENDED 🎉')
              .setDescription(`**Prize:** ${giveaway.prize}\n\n**Winner:** ${winner}`)
              .addFields({ name: '👤 Host', value: `<@${giveaway.host_id}>`, inline: true })
              .setFooter({ text: 'Congratulations!' })
              .setTimestamp();

            await giveawayMessage.edit({ embeds: [winnerEmbed] });
            await giveawayMessage.reply(`🎉 Congratulations ${winner}! You won **${giveaway.prize}**!`);
          }
        } else {
          // No entries, mark as ended
          await new Promise((resolve, reject) => {
            db.run(`UPDATE giveaways SET ended = 1 WHERE id = ?`, [giveaway.id], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
      } catch (error) {
        errorWithTimestamp(`Failed to end giveaway ${giveaway.id}:`, error);
      }
    }
  } catch (error) {
    errorWithTimestamp('Giveaway check error:', error);
  }
}

// Unlock achievement for user
async function unlockAchievement(userId, achievementId, guild, channelId = null) {
  try {
    // Check if already unlocked
    const existing = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM achievements WHERE user_id = ? AND achievement_id = ?`,
        [userId, achievementId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existing) return; // Already unlocked

    // Unlock achievement
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO achievements (user_id, achievement_id) VALUES (?, ?)`,
        [userId, achievementId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Achievement names and descriptions
    const achievementData = {
      first_message: { name: '👋 First Steps', desc: 'Sent your first message!' },
      chatty: { name: '💬 Chatty', desc: 'Sent 100 messages!' },
      chatterbox: { name: '🗣️ Chatterbox', desc: 'Sent 1,000 messages!' },
      legendary_talker: { name: '👑 Legendary Talker', desc: 'Sent 10,000 messages!' },
      level_5: { name: '⭐ Rising Star', desc: 'Reached level 5!' },
      level_10: { name: '🌟 Superstar', desc: 'Reached level 10!' },
      voice_active: { name: '🎤 Voice Active', desc: 'Spent 60 minutes in voice!' },
      voice_enthusiast: { name: '🎧 Voice Enthusiast', desc: 'Spent 500 minutes in voice!' },
      trivia_master: { name: '🧠 Trivia Master', desc: 'Won 10 trivia games!' },
      money_maker: { name: '💰 Money Maker', desc: `Earned 10,000 ${currencyDisplay(config)}!` },
      generous: { name: '🤝 Generous', desc: 'Gifted money 5 times!' },
      gambler: { name: '🎰 Gambler', desc: 'Played 50 mini-games!' },
      lucky_streak: { name: '🍀 Lucky Streak', desc: 'Won 5 coinflips in a row!' },
      helpful: { name: '⭐ Helpful', desc: 'Received 10 reputation points!' },
    };

    const achievement = achievementData[achievementId];
    if (!achievement) return;

    // Send notification
    let channel;
    if (channelId) {
      channel = await client.channels.fetch(channelId);
    } else {
      const generalChannel = guild?.channels.cache.find(ch => ch.name === config.generalChannelName);
      channel = generalChannel;
    }

    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🏆 Achievement Unlocked!')
        .setDescription(`<@${userId}> unlocked: **${achievement.name}**\n*${achievement.desc}*`)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    errorWithTimestamp('Achievement unlock error:', error);
  }
}

// Check user achievements based on their stats
async function checkAchievements(userId, guild, channelId) {
  try {
    // Get user stats
    const userStats = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!userStats) return;

    // Check achievement tracking stats
    const trackingStats = await new Promise((resolve, reject) => {
      db.get(`SELECT * FROM achievement_stats WHERE user_id = ?`, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Check message achievements
    if (userStats.messages >= 1) await unlockAchievement(userId, 'first_message', guild, channelId);
    if (userStats.messages >= 100) await unlockAchievement(userId, 'chatty', guild, channelId);
    if (userStats.messages >= 1000) await unlockAchievement(userId, 'chatterbox', guild, channelId);
    if (userStats.messages >= 10000) await unlockAchievement(userId, 'legendary_talker', guild, channelId);

    // Check level achievements
    if (userStats.level >= 5) await unlockAchievement(userId, 'level_5', guild, channelId);
    if (userStats.level >= 10) await unlockAchievement(userId, 'level_10', guild, channelId);

    // Check voice achievements
    if (userStats.voiceMinutes >= 60) await unlockAchievement(userId, 'voice_active', guild, channelId);
    if (userStats.voiceMinutes >= 500) await unlockAchievement(userId, 'voice_enthusiast', guild, channelId);

    // Check tracking stats achievements if available
    if (trackingStats) {
      if (trackingStats.trivia_wins >= 10) await unlockAchievement(userId, 'trivia_master', guild, channelId);
      if (trackingStats.money_earned >= 10000) await unlockAchievement(userId, 'money_maker', guild, channelId);
      if (trackingStats.gifts_given >= 5) await unlockAchievement(userId, 'generous', guild, channelId);
      if (trackingStats.games_played >= 50) await unlockAchievement(userId, 'gambler', guild, channelId);
      if (trackingStats.best_coinflip_streak >= 5) await unlockAchievement(userId, 'lucky_streak', guild, channelId);
    }

    // Check reputation achievement
    const repPoints = await new Promise((resolve, reject) => {
      db.get(`SELECT points FROM reputation WHERE user_id = ?`, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.points : 0);
      });
    });

    if (repPoints >= 10) await unlockAchievement(userId, 'helpful', guild, channelId);

  } catch (error) {
    errorWithTimestamp('Check achievements error:', error);
  }
}

// --- Event Loading (Enhanced) ---
try {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  
  // Events that are handled inline (to prevent duplicates)
  const skipEvents = ['messageCreate', 'voiceStateUpdate', 'guildMemberAdd', 'ready'];
  
  for (const file of eventFiles) {
    try {
      const event = require(path.join(eventsPath, file));

      if (!event.name || typeof event.execute !== 'function') {
        errorWithTimestamp(`Invalid event structure in ${file}`);
        continue;
      }

      // Skip events that are handled inline
      if (skipEvents.includes(event.name)) {
        logWithTimestamp(`Skipped event ${event.name} (handled inline)`);
        continue;
      }

      // Wrap event execution with error handling
      const originalExecute = event.execute;
      event.execute = async (...args) => {
        try {
          // For 'ready' event, pass client first, then logging functions
          if (event.name === 'ready') {
            await originalExecute(args[0], logWithTimestamp, errorWithTimestamp);
          } else {
            // For other events, append the helper functions
            await originalExecute(...args, client, db, trivia, cooldowns, logWithTimestamp, errorWithTimestamp);
          }
        } catch (error) {
          errorWithTimestamp(`Event ${event.name} error:`, error);
        }
      };

      if (event.once) {
        client.once(event.name, event.execute);
      } else {
        client.on(event.name, event.execute);
      }

      logWithTimestamp(`Loaded event: ${event.name}`);
    } catch (error) {
      errorWithTimestamp(`Failed to load event ${file}:`, error);
    }
  }
} catch (error) {
  errorWithTimestamp('Failed to load events:', error);
}

// --- Enhanced Ready Event ---
client.once('clientReady', async () => {
  try {
    logWithTimestamp(`${client.user.tag} is now online!`);

    // Initialize systems that need the client
    healthMonitor = new HealthMonitor(client, db);
    shutdownManager = new ShutdownManager(client, db, backupManager, healthMonitor);
    tempPunishmentManager = new TempPunishmentManager(client, db, auditLogger);

    // Register cleanup tasks
    shutdownManager.registerCommonCleanupTasks();
    shutdownManager.registerCleanupTask('final_backup', async () => {
      await backupManager.createBackup('shutdown');
    }, 1);

    // Initialize backup systems
    await backupManager.init();
    backupManager.scheduleBackups(24 * 60 * 60 * 1000); // Daily database backups
    
    await codeBackupManager.init();
    codeBackupManager.scheduleBackups(24 * 60 * 60 * 1000); // Daily code backups

    // Run pending migrations
    try {
      const migrationResult = await migrationManager.runPendingMigrations();
      if (migrationResult.migrationsRun > 0) {
        logWithTimestamp(`Applied ${migrationResult.migrationsRun} database migrations`);
      }
    } catch (error) {
      errorWithTimestamp('Migration error:', error);
    }
    
    // Initialize economy system
    try {
      await economySystem.initialize();
      logWithTimestamp('Economy system initialized');
    } catch (error) {
      errorWithTimestamp('Economy initialization error:', error);
    }

    // Initialize News Feed system
    try {
      newsFeed = new NewsFeed(db, client);
      await newsFeed.initialize();
      logWithTimestamp('News Feed system ready');
    } catch (error) {
      errorWithTimestamp('Failed to initialize News Feed:', error);
    }

    // Initialize Phase 3 tables (reminders and giveaways)
    try {
      await dbAsync.run(`
        CREATE TABLE IF NOT EXISTS reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          message TEXT NOT NULL,
          remind_at DATETIME NOT NULL,
          reminded BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await dbAsync.run(`CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_at, reminded)`);
      
      await dbAsync.run(`
        CREATE TABLE IF NOT EXISTS giveaways (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT NOT NULL UNIQUE,
          channel_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          prize TEXT NOT NULL,
          host_id TEXT NOT NULL,
          winner_id TEXT,
          end_time DATETIME NOT NULL,
          ended BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await dbAsync.run(`CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(ended, end_time)`);
      
      await dbAsync.run(`
        CREATE TABLE IF NOT EXISTS achievement_stats (
          user_id TEXT PRIMARY KEY,
          trivia_wins INTEGER DEFAULT 0,
          money_earned INTEGER DEFAULT 0,
          gifts_given INTEGER DEFAULT 0,
          games_played INTEGER DEFAULT 0,
          coinflip_streak INTEGER DEFAULT 0,
          best_coinflip_streak INTEGER DEFAULT 0
        )
      `);
      
      await dbAsync.run(`
        CREATE TABLE IF NOT EXISTS achievements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          achievement_id TEXT NOT NULL,
          unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, achievement_id)
        )
      `);
      await dbAsync.run(`CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id)`);
      
      await dbAsync.run(`
        CREATE TABLE IF NOT EXISTS reputation (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          points INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await dbAsync.run(`CREATE INDEX IF NOT EXISTS idx_rep_points ON reputation(points DESC)`);
      
      await dbAsync.run(`
        CREATE TABLE IF NOT EXISTS reputation_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          giver_id TEXT NOT NULL,
          receiver_id TEXT NOT NULL,
          reason TEXT,
          given_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await dbAsync.run(`CREATE INDEX IF NOT EXISTS idx_rep_log_giver ON reputation_log(giver_id, given_at DESC)`);
      
      await dbAsync.run(`
        CREATE TABLE IF NOT EXISTS afk_status (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          message TEXT,
          set_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      logWithTimestamp('Phase 3 tables (reminders, giveaways, achievement_stats, achievements, reputation, reputation_log, afk_status) initialized');
    } catch (error) {
      errorWithTimestamp('Phase 3 tables initialization error:', error);
    }

    // Load trivia questions
    trivia = await loadTrivia();

    // Warm up cache
    await cache.warmUp(db);

    // Set bot activity
    client.user.setActivity('Monitoring the community', { type: 'WATCHING' });
    // Start reminder checker (every minute)
    setInterval(async () => {
      try {
        await checkReminders();
      } catch (error) {
        errorWithTimestamp('Reminder interval execution failed:', error);
      }
    }, 60000);

    // Start giveaway checker (every 30 seconds)
    setInterval(async () => {
      await checkGiveaways();
    }, 30000);


    logWithTimestamp('All systems initialized successfully');

  } catch (error) {
    errorWithTimestamp('Ready event initialization failed:', error);
  }
});

// --- Prayer Corner Handler ---
async function handlePrayerCornerPost(message) {
  try {
    const threadId = message.channel.id;
    const threads = config.prayerThreads;

    // Determine which thread this is and respond accordingly
    let response = null;
    let emoji = '🙏';

    if (threadId === threads.healingComfort) {
      emoji = '💙';
      const encouragements = [
        `🙏 ${message.author}, we're standing with you in prayer for healing and comfort. May God's peace surround you.`,
        `💙 Lifting you up, ${message.author}. God is close to the brokenhearted  trusting Him for your restoration.`,
        `🙏 Praying for healing and peace over you, ${message.author}. You're not alone in this.`,
        `💙 May the Lord bring comfort and renewal to you, ${message.author}. We're here with you in prayer.`
      ];
      response = encouragements[Math.floor(Math.random() * encouragements.length)];
    }
    else if (threadId === threads.encouragement) {
      emoji = '✨';
      response = `✨ Thank you for sharing encouragement, ${message.author}! Your words can be the light someone needs today. 🌟`;
    }
    else if (threadId === threads.testimony) {
      emoji = '🙌';
      const testimonies = [
        `🙌 Praise God, ${message.author}! Thank you for sharing how He's moved in your life!`,
        `✨ What a powerful testimony, ${message.author}! God is so good! 🙏`,
        `🎉 Glory to God, ${message.author}! Your story will encourage others to keep believing!`
      ];
      response = testimonies[Math.floor(Math.random() * testimonies.length)];
    }
    else if (threadId === threads.prayerRequests) {
      emoji = '🙏';
      const prayerResponses = [
        `🙏 Praying for you, ${message.author}. Trusting God to move in this situation.`,
        `💙 We're lifting this up with you, ${message.author}. God hears your prayers.`,
        `🙏 Standing in prayer with you, ${message.author}. May God's will be done.`,
        `💫 Believing with you, ${message.author}. God is faithful and hears every word.`
      ];
      response = prayerResponses[Math.floor(Math.random() * prayerResponses.length)];
    }
    else if (threadId === threads.strengthGuidance) {
      emoji = '💪';
      const strengthResponses = [
        `💪 Praying for strength and wisdom for you, ${message.author}. God will guide your steps.`,
        `🙏 Asking God to give you clarity and courage, ${message.author}. He'll make the path clear.`,
        `✨ Trusting God to provide direction and strength, ${message.author}. You're covered in prayer.`,
        `💙 May the Lord grant you peace and wisdom, ${message.author}. He's with you through it all.`
      ];
      response = strengthResponses[Math.floor(Math.random() * strengthResponses.length)];
    }

    // React with appropriate emoji
    if (emoji) {
      await message.react(emoji);
    }

    // Send encouraging response (only if not from a bot and has content)
    if (response && !message.author.bot && message.content.length > 20) {
      // Wait a moment to feel more natural
      setTimeout(async () => {
        await message.reply(response);
      }, 2000);
    }

    // Log prayer corner activity
    logWithTimestamp(`Prayer corner post in ${message.channel.name} by ${message.author.tag}`);

  } catch (error) {
    errorWithTimestamp('Prayer corner handler error:', error);
  }
}

// --- XP System Functions ---
async function awardXPForMessage(message) {
  const userId = message.author.id;

  // Check cooldown (1 minute per user)
  if (cooldowns.has(userId)) return;

  cooldowns.add(userId);
  setTimeout(() => cooldowns.delete(userId), 60000); // 1 minute cooldown

  try {
    // Ensure level roles exist (uses configured names)
    const configuredLevelRoles = config.levelRoles || [];
    for (let i = 0; i < Math.min(3, configuredLevelRoles.length); i++) {
      if (configuredLevelRoles[i]) await ensureRole(message.guild, configuredLevelRoles[i]);
    }

    let randomXP = Math.floor(Math.random() * 3) + 1; // 1-3 XP
    let boostActive = false;
    
    // Check for active XP boost
    if (economySystem && economySystem.initialized) {
      boostActive = await economySystem.hasActiveBoost(userId, 'xp_boost');
      if (boostActive) {
        randomXP *= 2; // Double XP with boost
      }
    }

    // Get current user data
    const row = await dbAsync.get(`SELECT xp, level FROM users WHERE id = ?`, [userId]);
    const currentXp = row ? row.xp : 0;
    const currentLevel = row ? row.level : 0;
    const newXp = currentXp + randomXP;

    // Update user XP and messages
    await dbAsync.run(`INSERT INTO users (id, username, xp, level, messages, voiceMinutes)
            VALUES (?, ?, ?, ?, 1, 0)
            ON CONFLICT(id) DO UPDATE SET
              xp = xp + ?,
              messages = messages + 1,
              username = ?`,
            [userId, message.author.username, newXp, currentLevel, randomXP, message.author.username]);

    // Check for level up
    const thresholds = config.levelThresholds || [];
    const levelRoles = config.levelRoles || [];
    let newLevel = currentLevel;

    // Check each level threshold from highest to lowest
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (newXp >= thresholds[i] && currentLevel < (i + 1)) {
        newLevel = i + 1;
        break;
      }
    }

    // If level increased, update and assign role
    if (newLevel > currentLevel) {
      await dbAsync.run(`UPDATE users SET level = ? WHERE id = ?`, [newLevel, userId]);

      // Assign appropriate role
      const roleName = levelRoles[newLevel - 1];
      await ensureRole(message.guild, roleName);
      const role = message.guild.roles.cache.find(r => r.name === roleName);
      
      if (role && message.member && !message.member.roles.cache.has(role.id)) {
        try {
          // Remove old level roles before adding new one
          for (let i = 0; i < levelRoles.length; i++) {
            const oldRole = message.guild.roles.cache.find(r => r.name === levelRoles[i]);
            if (oldRole && message.member.roles.cache.has(oldRole.id)) {
              await message.member.roles.remove(oldRole);
            }
          }
          
          await message.member.roles.add(role);
          const boostEmoji = boostActive ? ' ⚡' : '';
          const branding = config.branding || {};
          if (branding.levelUpMessage) {
            message.channel.send(formatMessage(branding.levelUpMessage, {
              member: message.author.toString(),
              role: roleName,
              boostEmoji
            }));
          }
          logWithTimestamp(`User ${message.author.tag} leveled up to ${roleName} (XP: ${newXp})${boostActive ? ' [BOOSTED]' : ''}`);
        } catch (error) {
          errorWithTimestamp('Error assigning level role:', error);
        }
      }
    }
    
    // Check for message milestone roles
    await checkMessageRoles(message, newXp);
    
    // Check for achievements
    await checkAchievements(userId, message.guild, message.channel.id);
    
  } catch (error) {
    errorWithTimestamp('Error awarding XP:', error);
  }
}

// --- Check and Award Message Milestone Roles ---
async function checkMessageRoles(message, currentXp) {
  try {
    const userId = message.author.id;
    const row = await dbAsync.get(`SELECT messages FROM users WHERE id = ?`, [userId]);
    const messageCount = row ? row.messages : 0;
    
    const messageRoles = config.messageRoles || [
      { name: 'Chatter', messages: 100 },
      { name: 'Conversationalist', messages: 500 },
      { name: 'Social Butterfly', messages: 1000 },
      { name: 'Community Pillar', messages: 5000 },
      { name: 'Message Master', messages: 10000 }
    ];
    
    // Check each threshold and assign role if reached
    for (const roleConfig of messageRoles) {
      if (messageCount >= roleConfig.messages) {
        await ensureRole(message.guild, roleConfig.name);
        const role = message.guild.roles.cache.find(r => r.name === roleConfig.name);
        
        if (role && message.member && !message.member.roles.cache.has(role.id)) {
          try {
            await message.member.roles.add(role);
            message.channel.send(`📝 Respect ${message.author}! You earned the **${roleConfig.name}** role for ${roleConfig.messages}+ messages! 💬`);
            logWithTimestamp(`User ${message.author.tag} earned ${roleConfig.name} role (${messageCount} messages)`);
            
            // Log audit
            if (auditLogger) {
              await auditLogger.logAction({
                guildId: message.guild.id,
                actionType: 'role_add',
                moderator: { id: 'SYSTEM', username: 'System' },
                target: message.member,
                reason: `Earned ${roleConfig.name} role through message activity (${messageCount} messages)`
              });
            }
          } catch (error) {
            errorWithTimestamp('Error assigning message role:', error);
          }
        }
      }
    }
  } catch (error) {
    errorWithTimestamp('Error checking message roles:', error);
  }
}

// --- Enhanced Message Handler ---
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Record message processing
  if (healthMonitor) {
    healthMonitor.recordMessage();
    // --- AFK System ---
    // Check if user is AFK and remove status when they send a message
    try {
      const userAfk = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM afk_status WHERE user_id = ?`, [message.author.id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (userAfk) {
        await new Promise((resolve, reject) => {
          db.run(`DELETE FROM afk_status WHERE user_id = ?`, [message.author.id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        const afkDuration = Date.now() - new Date(userAfk.set_at).getTime();
        const minutes = Math.floor(afkDuration / 60000);
        const hours = Math.floor(minutes / 60);
        const timeStr = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;

        await message.reply(`👋 Welcome back! You were AFK for ${timeStr}.`);
      }
    } catch (error) {
      // Silently handle AFK check errors
    }

    // Check if any mentioned users are AFK
    try {
      if (message.mentions.users.size > 0) {
        for (const [userId, user] of message.mentions.users) {
          if (user.bot) continue;

          const afkUser = await new Promise((resolve, reject) => {
            db.get(`SELECT * FROM afk_status WHERE user_id = ?`, [userId], (err, row) => {
              if (err) reject(err);
              else resolve(row);
            });
          });

          if (afkUser) {
            const afkDuration = Date.now() - new Date(afkUser.set_at).getTime();
            const minutes = Math.floor(afkDuration / 60000);
            const hours = Math.floor(minutes / 60);
            const timeStr = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;

            await message.reply(`💤 ${user.username} is currently AFK (${timeStr}): ${afkUser.message}`);
          }
        }
      }
    } catch (error) {
      // Silently handle mentioned AFK check errors
    }

  }

  // Check for prayer corner forum posts (handle before command processing)
  if (message.channel.isThread() && message.channel.parentId === config.prayerCornerForumId) {
    await handlePrayerCornerPost(message);
  }

  // Check for trivia answers first (before command processing)
  if (!message.content.startsWith(config.prefix)) {
    try {
      const dailytestCommand = client.commands.get('dailytest');
      if (dailytestCommand && dailytestCommand.checkAnswer) {
        const wasTrivia = await dailytestCommand.checkAnswer(message, db, EmbedBuilder, economySystem);
        if (wasTrivia) return; // If it was a trivia answer, don't process further
      }
    } catch (error) {
      // Silently handle trivia check errors
    }

    // Award XP for regular messages (non-commands)
    if (message.guild) {
      await awardXPForMessage(message);
    }
    return; // Non-command message, exit
  }

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  // Check for command aliases
  let command = client.commands.get(commandName);
  if (!command) {
    // Search through all commands for matching aliases
    for (const cmd of client.commands.values()) {
      if (cmd.aliases && cmd.aliases.includes(commandName)) {
        command = cmd;
        break;
      }
    }
  }

  if (!command) return;

  // Commands are already wrapped with enhanced error handling in the loader
  // Pass additional context for commands that need it
  await command.execute(message, args, db, EmbedBuilder, { newsFeed, economySystem, analytics, healthMonitor });
});

// --- Enhanced Scheduled Tasks ---

// Daily Challenge with Error Handling - 12 PM EST
schedule.scheduleJob({ hour: config.dailyChallengeHour, minute: 0, tz: 'America/New_York' }, async () => {
  try {
    const guild = getPrimaryGuild(client);
    if (!guild) return;

    const channel = guild.channels.cache.get(config.generalChannelId) ||
                    guild.channels.cache.find(ch => ch.name === config.generalChannelName) ||
                    guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages'));
    if (!channel) return;

    // Use the dailytest command for consistency
    const dailytestCommand = client.commands.get('dailytest');
    if (dailytestCommand) {
      // Create a mock message object to trigger the dailytest command
      const mockMessage = {
        channel: channel,
        author: { id: 'system', bot: true }, // Mark as system/bot
        member: { permissions: { has: () => true } }, // Give admin permissions to bypass rate limiting
        content: '!dailytest'
      };

      await dailytestCommand.execute(mockMessage, [], db, EmbedBuilder);
      logWithTimestamp(`Daily challenge automatically started at ${new Date().toLocaleTimeString()}`);

      // Record feature usage
      await analytics.recordFeature('daily_challenge', guild.id);
    } else {
      errorWithTimestamp('dailytest command not found');
    }

  } catch (error) {
    errorWithTimestamp('Daily challenge error:', error);
  }
});

// Enhanced Birthday Check - 9 AM EST
schedule.scheduleJob({ hour: config.birthdayCheckHour, minute: 0, tz: 'America/New_York' }, async () => {
  try {
    const guild = getPrimaryGuild(client);
    if (!guild) return;

    const channel = guild.channels.cache.get(config.generalChannelId) ||
                    guild.channels.cache.find(ch => ch.name === config.generalChannelName) ||
                    guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages'));
    if (!channel) return;

    const today = new Date();
    const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const users = await dbAsync.all(`SELECT username, id, birthday FROM users WHERE birthday IS NOT NULL`);

    for (const user of users) {
      if (user.birthday) {
        const [, month, day] = user.birthday.split('-');
        if (`${month}-${day}` === todayStr) {
          const branding = config.branding || {};
          if (branding.birthdayChannelMessage) {
            await channel.send(formatMessage(branding.birthdayChannelMessage, {
              mention: `<@${user.id}>`
            }));
          }

          const member = guild.members.cache.get(user.id);
          if (member && branding.birthdayDmMessage) {
            try {
              await member.send(formatMessage(branding.birthdayDmMessage, {
                username: user.username
              }));
            } catch (error) {
              // User might have DMs disabled
            }
          }

          // Record feature usage
          await analytics.recordFeature('birthday_announcement', guild.id);
        }
      }
    }

  } catch (error) {
    errorWithTimestamp('Birthday check error:', error);
  }
});

// Good Morning Message with Motivational Quote - 8 AM EST
schedule.scheduleJob({ hour: config.goodMorningHour, minute: 0, tz: 'America/New_York' }, async () => { // 8:00 AM EST daily
  try {
    const guild = getPrimaryGuild(client);
    if (!guild) return;

    const channel = guild.channels.cache.get(config.generalChannelId) ||
                    guild.channels.cache.find(ch => ch.name === config.generalChannelName) ||
                    guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages'));
    if (!channel) return;

    // Generate motivational quote using OpenAI
    let motivationalQuote = "Rise and shine! Today is a new opportunity to be your best self! 🌅";

    try {
      if (openai) {
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{
            role: "user",
            content: "Generate a short, uplifting motivational quote for a good morning message. Keep it under 100 characters and inspiring. No quotation marks needed."
          }],
          max_tokens: 50,
          temperature: 0.8
        });

        if (response.choices && response.choices[0] && response.choices[0].message) {
          motivationalQuote = response.choices[0].message.content.trim();
        }
      }
    } catch (aiError) {
      logWithTimestamp('OpenAI quote generation failed, using fallback:', aiError.message);
    }

    // Send good morning message with @everyone mention
    const community = (config.branding && config.branding.communityName) || 'Our';
    const embed = new EmbedBuilder()
      .setTitle(`🌅 Good Morning, ${community} Crew! 🌅`)
      .setDescription(`${motivationalQuote}\n\nHave a blessed day, everyone! 💪✨`)
      .setColor('#FFD700') // Golden color for morning
      .setTimestamp();

    await channel.send({
      content: '@everyone',
      embeds: [embed]
    });

    logWithTimestamp('Good morning message sent successfully');

    // Record feature usage
    await analytics.recordFeature('good_morning_message', guild.id);

  } catch (error) {
    errorWithTimestamp('Good morning message failed:', error);
  }
});

// Good Evening Message with Safety Reminder - 5 PM EST
schedule.scheduleJob({ hour: config.goodEveningHour, minute: 0, tz: 'America/New_York' }, async () => { // 5:00 PM EST daily
  try {
    const guild = getPrimaryGuild(client);
    if (!guild) return;

    const channel = guild.channels.cache.get(config.generalChannelId) ||
                    guild.channels.cache.find(ch => ch.name === config.generalChannelName) ||
                    guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages'));
    if (!channel) return;

    const community = (config.branding && config.branding.communityName) || 'Our';

    // Generate evening message using OpenAI
    let eveningMessage = formatMessage(
      "Good evening, {community} family! 🌆 Hope you had a productive day. If you're heading home, drive safe and take care! 🚗✨",
      { community }
    );

    try {
      if (openai) {
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{
            role: "user",
            content: `Generate a warm good evening message for a Discord community called '${community} Crew'. Include a safety reminder for people who might be traveling home from work. Keep it friendly, caring, and under 150 characters. Include travel safety wishes.`
          }],
          max_tokens: 75,
          temperature: 0.7
        });

        if (response.choices && response.choices[0] && response.choices[0].message) {
          eveningMessage = response.choices[0].message.content.trim();
        }
      }
    } catch (aiError) {
      logWithTimestamp('OpenAI evening message generation failed, using fallback:', aiError.message);
    }

    // Send good evening message with @everyone mention
    const embed = new EmbedBuilder()
      .setTitle(`🌆 Good Evening, ${community} Crew! 🌆`)
      .setDescription(`${eveningMessage}\n\n🚗 **Safe travels to everyone heading home!** 🚗\n💙 Take care and see you tomorrow! 💙`)
      .setColor('#FF6B35') // Sunset orange color
      .setTimestamp();

    await channel.send({
      content: '@everyone',
      embeds: [embed]
    });

    logWithTimestamp('Good evening message sent successfully');

    // Record feature usage
    await analytics.recordFeature('good_evening_message', guild.id);

  } catch (error) {
    errorWithTimestamp('Good evening message failed:', error);
  }
});

// Daily Prayer Prompt - 7 AM EST
schedule.scheduleJob({ hour: config.prayerPromptHour, minute: 0, tz: 'America/New_York' }, async () => {
  try {
    const guild = getPrimaryGuild(client);
    if (!guild) return;

    const prayerForum = guild.channels.cache.get(config.prayerCornerForumId);
    if (!prayerForum) return;

    // Day-specific prayer prompts matched to actual days
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, etc.
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[dayOfWeek];

    // Map each day to a specific thread and message
    const dayPrompts = {
      0: { // Sunday - Prayer Requests
        thread: config.prayerThreads.prayerRequests,
        message: `🙏 **Sunday Prayer Call** 🙏\n\nGood morning, {community} family! It's Sunday—a perfect day to lift up your prayer requests. What's on your heart today? We're here to pray with you! 💙`
      },
      1: { // Monday - Strength & Guidance
        thread: config.prayerThreads.strengthGuidance,
        message: `💪 **Monday Motivation** 💪\n\nGood morning! Starting the week strong? If you're facing challenges or big decisions, share here. We're praying for God's wisdom and strength to guide you! 🙏`
      },
      2: { // Tuesday - Testimony
        thread: config.prayerThreads.testimony,
        message: `🙌 **Testimony Tuesday!** 🙌\n\nGood morning! Has God moved in your life recently? Share your testimony today! Every praise report encourages someone else to keep believing. 🎉`
      },
      3: { // Wednesday - Healing & Comfort
        thread: config.prayerThreads.healingComfort,
        message: `💙 **Wellness Wednesday - Healing & Comfort** 💙\n\nGood morning! If you or someone you know needs healing—physical, emotional, or spiritual—share here. We're standing with you in faith for restoration and peace. 🙏`
      },
      4: { // Thursday - Encouragement
        thread: config.prayerThreads.encouragement,
        message: `✨ **Thankful Thursday - Words of Encouragement** ✨\n\nGood morning! Share an encouraging word, scripture, or affirmation to uplift someone today. Your words might be exactly what someone needs to hear! 🌟`
      },
      5: { // Friday - Prayer Requests
        thread: config.prayerThreads.prayerRequests,
        message: `🙏 **Friday Prayer Focus** 🙏\n\nGood morning! As we head into the weekend, share what's on your heart. We're here to lift you up in prayer! 💙`
      },
      6: { // Saturday - Strength & Guidance
        thread: config.prayerThreads.strengthGuidance,
        message: `💪 **Saturday Strength Check** 💪\n\nGood morning! Need direction or clarity for something? Share here and let us pray for God's guidance and courage through every situation. 🙏`
      }
    };

    const prompt = dayPrompts[dayOfWeek];

    // Get the thread
    const thread = guild.channels.cache.get(prompt.thread);
    if (thread && thread.isThread()) {
      await thread.send(prompt.message);
      logWithTimestamp(`Daily prayer prompt sent to ${thread.name}`);

      // Record feature usage
      await analytics.recordFeature('daily_prayer_prompt', guild.id);
    }

  } catch (error) {
    errorWithTimestamp('Daily prayer prompt failed:', error);
  }
});

// --- Holiday Announcements - 9 AM EST ---
// Helper function to get Easter date for a given year (Computus algorithm)
function getEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Helper function to get nth weekday of a month (e.g., 3rd Monday)
function getNthWeekdayOfMonth(year, month, weekday, n) {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (weekday - firstDay.getDay() + 7) % 7;
  const day = 1 + firstWeekday + (n - 1) * 7;
  return new Date(year, month, day);
}

// Helper function to get last weekday of a month (e.g., last Monday)
function getLastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(year, month + 1, 0);
  const diff = (lastDay.getDay() - weekday + 7) % 7;
  return new Date(year, month, lastDay.getDate() - diff);
}

// Holiday definitions with messages
function getHolidays(year) {
  return [
    // Fixed date holidays
    {
      name: "New Year's Day",
      date: new Date(year, 0, 1), // January 1
      message: `🎆🎉 **HAPPY NEW YEAR ${year}!** 🎉🎆\n\n@everyone\n\nOut with the old, in with the new! 🌟\n\nAs we step into ${year}, let's leave behind what no longer serves us and embrace fresh opportunities with open hearts. The {community} family has been through it all together, and this year we rise even higher!\n\nMay ${year} bring you:\n✨ Health and strength\n💰 Financial blessings\n❤️ Love and meaningful connections\n🎯 Success in all your endeavors\n\nNew year, new blessings, same amazing family. Big tings a gwaan fi we! 🇯🇲🙏`
    },
    {
      name: "Martin Luther King Jr. Day",
      date: getNthWeekdayOfMonth(year, 0, 1, 3), // 3rd Monday of January
      message: `✊🏿 **Happy Martin Luther King Jr. Day** ✊🏿\n\n@everyone\n\n*"The time is always right to do what is right."*\n*— Dr. Martin Luther King Jr.*\n\nToday we honor a man who dared to dream of a world united by love, not divided by hate. His words still echo, reminding us that change starts with each of us.\n\n💭 Take a moment today to reflect on how you can spread kindness, stand for justice, and be the change you wish to see.\n\nThe dream lives on through our actions. 🕊️✨`
    },
    {
      name: "Valentine's Day",
      date: new Date(year, 1, 14), // February 14
      message: `💕❤️ **Happy Valentine's Day!** ❤️💕\n\n@everyone\n\nLove is in the air! 🌹✨\n\nWhether you're spending today with your soulmate, your best friends, your family, or just treating yourself — remember this:\n\n**You are worthy of love. You are enough. You matter.**\n\nTo the couples: cherish each other 💑\nTo the singles: self-love is the best love 💖\nTo everyone: spread love wherever you go!\n\nThe {community} family loves you! Now go eat some chocolate 🍫😂`
    },
    {
      name: "Presidents' Day",
      date: getNthWeekdayOfMonth(year, 1, 1, 3), // 3rd Monday of February
      message: `🇺🇸 **Happy Presidents' Day!** 🇺🇸\n\n@everyone\n\nEnjoy your day off (if you got one)! 🎉\n\nUse this long weekend to rest, recharge, and reset. You've earned it! Whether you're relaxing at home or out making memories, make the most of it.\n\nSee you on the other side! 💪😊`
    },
    {
      name: "St. Patrick's Day",
      date: new Date(year, 2, 17), // March 17
      message: `☘️🍀 **Happy St. Patrick's Day!** 🍀☘️\n\n@everyone\n\nMay your day be touched with a bit of Irish luck! 🌈\n\n*"May your troubles be less, and your blessings be more, and nothing but happiness come through your door."*\n\nWearing green? You better be! 💚 Not wearing green? *Pinch incoming!* 👀😂\n\nHave a lucky and blessed day, {community} fam! 🇮🇪✨`
    },
    {
      name: "Easter",
      date: getEasterDate(year),
      message: `🐣✝️ **Happy Easter!** ✝️🐣\n\n@everyone\n\n**He is Risen!** 🙏✨\n\nToday we celebrate the greatest comeback in history — the resurrection of our Lord and Savior, Jesus Christ. Because of Him, we have hope, we have grace, and we have eternal life.\n\n🌷 May this Easter fill your heart with:\n• Renewed faith\n• Abundant joy\n• Peace that surpasses understanding\n• The warmth of family and fellowship\n\nWishing you a blessed Easter filled with love and celebration! 🥚🐰💐`
    },
    {
      name: "Mother's Day",
      date: getNthWeekdayOfMonth(year, 4, 0, 2), // 2nd Sunday of May
      message: `💐👩‍👧‍👦 **Happy Mother's Day!** 👩‍👧‍👦💐\n\n@everyone\n\nTo every mother, grandmother, stepmom, foster mom, bonus mom, and mother figure in the {community} family — **THANK YOU.** 💕\n\nYou are the backbone of families. You love unconditionally. You sacrifice endlessly. You pray without ceasing. You are QUEENS. 👑\n\n*"Her children rise up and call her blessed."* — Proverbs 31:28\n\nToday, we celebrate YOU! Take the day to rest, be pampered, and know you are deeply appreciated. 🌹🙏\n\nBig up all the mothers! 🇯🇲❤️`
    },
    {
      name: "Memorial Day",
      date: getLastWeekdayOfMonth(year, 4, 1), // Last Monday of May
      message: `🇺🇸🎖️ **Memorial Day** 🎖️🇺🇸\n\n@everyone\n\n*"All gave some. Some gave all."*\n\nToday we pause to honor the brave men and women who made the ultimate sacrifice for our freedom. They left their families, faced the unimaginable, and gave their lives so we could live ours.\n\n🕯️ We remember them.\n🙏 We honor them.\n❤️ We thank them.\n\nTo the families of fallen heroes — your loved ones are not forgotten. Their legacy lives on in every free breath we take.\n\nHave a safe and meaningful Memorial Day weekend. 🇺🇸`
    },
    {
      name: "Juneteenth",
      date: new Date(year, 5, 19), // June 19
      message: `✊🏿🎉 **Happy Juneteenth!** 🎉✊🏿\n\n@everyone\n\n**Freedom Day.** 🗽\n\nOn this day in 1865, enslaved African Americans in Texas finally received news of their freedom — two and a half years after the Emancipation Proclamation.\n\nToday we celebrate:\n🖤 The resilience of our ancestors\n✊🏿 The ongoing fight for equality\n🎉 The joy of freedom\n💪 The strength of our community\n\n*"We are the dreams of our ancestors realized."*\n\nCelebrate, reflect, and continue pushing forward. The journey continues! ✨🙏`
    },
    {
      name: "Father's Day",
      date: getNthWeekdayOfMonth(year, 5, 0, 3), // 3rd Sunday of June
      message: `👨‍👧‍👦💪 **Happy Father's Day!** 💪👨‍👧‍👦\n\n@everyone\n\nTo every father, grandfather, stepdad, uncle, big brother, and father figure in the {community} family — **today is YOUR day!** 🎉\n\nYou work hard. You protect. You provide. You lead by example. You show up even when life gets tough. You are KINGS. 👑\n\nThank you for:\n• The sacrifices nobody sees\n• The wisdom you share\n• The strength you give\n• The love you show\n\nBig up all the real ones holding it down! Enjoy your day, fellas! 🙏❤️🇯🇲`
    },
    {
      name: "Independence Day",
      date: new Date(year, 6, 4), // July 4
      message: `🇺🇸🎆 **Happy 4th of July!** 🎆🇺🇸\n\n@everyone\n\n**Let freedom ring!** 🗽🎉\n\nHappy Independence Day to the {community} family! Today we celebrate freedom, unity, and the American spirit.\n\n🎆 Watch some fireworks\n🌭 Throw something on the grill\n👨‍👩‍👧‍👦 Spend time with loved ones\n🙏 Be grateful for your freedoms\n\nStay safe out there — especially with those fireworks! 👀😂\n\nHave an amazing 4th! 🇺🇸❤️🤍💙`
    },
    {
      name: "Labor Day",
      date: getNthWeekdayOfMonth(year, 8, 1, 1), // 1st Monday of September
      message: `💼🛠️ **Happy Labor Day!** 🛠️💼\n\n@everyone\n\n**You work hard. Today, you rest.** 💪\n\nThis day honors the dedication, hard work, and contributions of workers everywhere. Whether you're grinding 9-5, hustling on your own business, studying for your future, or holding it down at home — you deserve this break!\n\n☀️ Enjoy the long weekend\n🍖 Fire up the grill one last time\n😴 Get some extra rest\n🎉 Celebrate your hard work\n\nSummer's winding down, but we're just getting started! See you on the other side! 🙌`
    },
    {
      name: "Veterans Day",
      date: new Date(year, 10, 11), // November 11
      message: `🎖️🇺🇸 **Happy Veterans Day** 🇺🇸🎖️\n\n@everyone\n\n**To all who have served — THANK YOU.** 🙏\n\nToday we honor the brave men and women who put on the uniform to defend our country and our freedoms. Your courage, sacrifice, and dedication do not go unnoticed.\n\n🎖️ To those who served and came home\n💔 To those who served and are no longer with us\n🙏 To the families who waited and worried\n\n**We see you. We thank you. We honor you.**\n\nIf you're a veteran in the {community} family — we salute you! 🫡❤️`
    },
    {
      name: "Thanksgiving",
      date: getNthWeekdayOfMonth(year, 10, 4, 4), // 4th Thursday of November
      message: `🦃🍂 **Happy Thanksgiving!** 🍂🦃\n\n@everyone\n\n**Give thanks with a grateful heart!** 🙏\n\nToday we gather (or FaceTime 😂) with the ones we love to count our blessings and stuff our faces! 🍗\n\nTake a moment to appreciate:\n• The roof over your head 🏠\n• The food on your table 🍽️\n• The people who love you 💕\n• The breath in your lungs 🌬️\n• This amazing community 🎉\n\n*"In everything give thanks."* — 1 Thessalonians 5:18\n\nHappy Thanksgiving, {community} family! Enjoy the food coma! 😴🦃🇯🇲`
    },
    {
      name: "Christmas",
      date: new Date(year, 11, 25), // December 25
      message: `🎄🎅 **Merry Christmas!** 🎅🎄\n\n@everyone\n\n**Glory to God in the highest!** ✨🙏\n\nToday we celebrate the birth of our Lord and Savior, Jesus Christ — the greatest gift ever given to humanity.\n\n🎁 May your Christmas be filled with:\n• The warmth of family and friends\n• The joy of giving and receiving\n• The peace that only Christ can bring\n• Good food and even better company!\n\n*"For unto us a child is born, unto us a son is given."* — Isaiah 9:6\n\nFrom the {community} family to yours — Merry Christmas! 🎄❤️💚\n\nGrand Market vibes and sorrel season in full effect! 🇯🇲🥤`
    }
  ];
}

// Check for holidays daily at configured hour
schedule.scheduleJob({ hour: config.holidayAnnouncementHour, minute: 0, tz: 'America/New_York' }, async () => {
  try {
    const branding = config.branding || {};
    if (branding.holidaysEnabled === false) return;

    const guild = getPrimaryGuild(client);
    if (!guild) return;

    const channel = guild.channels.cache.get(config.generalChannelId) ||
                    guild.channels.cache.find(ch => ch.name === config.generalChannelName);
    if (!channel) return;

    const today = new Date();
    const currentYear = today.getFullYear();
    const holidays = getHolidays(currentYear);
    const community = branding.communityName || 'Our';

    // Check if today matches any holiday
    for (const holiday of holidays) {
      const holidayDate = holiday.date;
      if (today.getMonth() === holidayDate.getMonth() && today.getDate() === holidayDate.getDate()) {
        const message = formatMessage(holiday.message, { community });

        const embed = new EmbedBuilder()
          .setColor(getHolidayColor(holiday.name))
          .setDescription(message)
          .setFooter({ text: `🎉 ${holiday.name} ${currentYear}` })
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        logWithTimestamp(`Holiday announcement sent: ${holiday.name}`);

        await analytics.recordFeature('holiday_announcement', guild.id);
        break; // Only send one holiday per day
      }
    }
  } catch (error) {
    errorWithTimestamp('Holiday announcement failed:', error);
  }
});

// Helper function to get holiday-specific embed colors
function getHolidayColor(holidayName) {
  const colors = {
    "New Year's Day": 0xFFD700,      // Gold
    "Martin Luther King Jr. Day": 0x8B4513, // Brown
    "Valentine's Day": 0xFF69B4,     // Pink
    "Presidents' Day": 0x3C3B6E,     // Navy Blue
    "St. Patrick's Day": 0x228B22,   // Green
    "Easter": 0xFFB6C1,              // Light Pink
    "Mother's Day": 0xFF69B4,        // Pink
    "Memorial Day": 0xB22234,        // Red
    "Juneteenth": 0xFF0000,          // Red
    "Father's Day": 0x4169E1,        // Royal Blue
    "Independence Day": 0xB22234,    // Red
    "Labor Day": 0x4169E1,           // Blue
    "Veterans Day": 0x3C3B6E,        // Navy Blue
    "Thanksgiving": 0xFF8C00,        // Orange
    "Christmas": 0x228B22            // Green
  };
  return colors[holidayName] || 0x5865F2; // Default Discord blurple
}

// Daily Analytics Generation - 1 AM EST
schedule.scheduleJob({ hour: 1, minute: 0, tz: 'America/New_York' }, async () => { // 1 AM EST daily
  try {
    await analytics.generateDailySummary();
    logWithTimestamp('Daily analytics summary generated');
  } catch (error) {
    errorWithTimestamp('Daily analytics generation failed:', error);
  }
});

// Daily reminder cleanup - 2:10 AM EST
schedule.scheduleJob({ hour: 2, minute: 10, tz: 'America/New_York' }, async () => {
  await cleanupOldReminders();
});

// Weekly Cleanup - 2 AM EST every Sunday
schedule.scheduleJob({ hour: 2, minute: 0, dayOfWeek: 0, tz: 'America/New_York' }, async () => { // 2 AM EST every Sunday
  try {
    await analytics.cleanup(90); // Keep 90 days
    await auditLogger.cleanup(90);
    await tempPunishmentManager.cleanup(90);

    logWithTimestamp('Weekly cleanup completed');
  } catch (error) {
    errorWithTimestamp('Weekly cleanup failed:', error);
  }
});

// --- News Feed Schedulers ---

// Tech News - Posts at 9 AM, 2 PM, 7 PM EST
if (config.newsFeeds && config.newsFeeds.techNews) {
  const techHours = config.newsFeeds.techNews.postHours || [9, 14, 19];
  techHours.forEach(hour => {
    schedule.scheduleJob({ hour: hour, minute: 0, tz: 'America/New_York' }, async () => {
      if (!newsFeed) return;
      try {
        const channelId = config.newsFeeds.techNews.channelId || config.newsFeeds.techNews.channelName;
        const result = await newsFeed.postTechNews(channelId, config.newsFeeds.techNews.maxPostsPerUpdate || 3);
        if (result.posted > 0) {
          logWithTimestamp(`Tech news posted: ${result.posted} articles`);
        }
      } catch (error) {
        errorWithTimestamp('Tech news posting failed:', error);
      }
    });
  });
  logWithTimestamp('Tech news scheduler configured for hours:', techHours.join(', '));
}

// Call of Duty News - Posts at 10 AM, 4 PM, 9 PM EST
if (config.newsFeeds && config.newsFeeds.codNews) {
  const codHours = config.newsFeeds.codNews.postHours || [10, 16, 21];
  codHours.forEach(hour => {
    schedule.scheduleJob({ hour: hour, minute: 0, tz: 'America/New_York' }, async () => {
      if (!newsFeed) return;
      try {
        const channelId = config.newsFeeds.codNews.channelId || config.newsFeeds.codNews.channelName;
        const result = await newsFeed.postCodNews(channelId, config.newsFeeds.codNews.maxPostsPerUpdate || 2);
        if (result.posted > 0) {
          logWithTimestamp(`CoD news posted: ${result.posted} articles`);
        }
      } catch (error) {
        errorWithTimestamp('CoD news posting failed:', error);
      }
    });
  });
  logWithTimestamp('CoD news scheduler configured for hours:', codHours.join(', '));
}

// Weekly news database cleanup - Sundays at 3 AM EST
schedule.scheduleJob({ hour: 3, minute: 0, dayOfWeek: 0, tz: 'America/New_York' }, async () => {
  if (!newsFeed) return;
  try {
    await newsFeed.cleanupOldPosts(30); // Keep 30 days of posted article tracking
    logWithTimestamp('News feed cleanup completed');
  } catch (error) {
    errorWithTimestamp('News feed cleanup failed:', error);
  }
});

// --- Voice Activity Tracking (Enhanced) ---
const voiceTimes = new Map();

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const member = newState.member;
    const guild = newState.guild;

    if (!member || member.user.bot) return;

    const generalChannel = guild.channels.cache.find(ch => ch.name === config.generalChannelName);

    // User joined a voice channel
    if (!oldState.channelId && newState.channelId) {
      voiceTimes.set(member.id, Date.now());
    }

    // User left a voice channel
    if (oldState.channelId && !newState.channelId) {
      const joinTime = voiceTimes.get(member.id);
      if (!joinTime) return;

      const duration = (Date.now() - joinTime) / (1000 * 60); // Minutes
      voiceTimes.delete(member.id);

      const existingUser = await dbAsync.get(`SELECT * FROM users WHERE id = ?`, [member.id]);
      const oldMinutes = existingUser ? existingUser.voiceMinutes : 0;
      const newMinutes = oldMinutes + Math.floor(duration);

      await dbAsync.run(`INSERT INTO users (id, username, xp, level, messages, voiceMinutes)
                         VALUES (?, ?, 0, 0, 0, ?)
                         ON CONFLICT(id) DO UPDATE SET voiceMinutes = ?`,
                        [member.id, member.user.username, newMinutes, newMinutes]);

      // Check for voice role progression (multiple tiers)
      const voiceRoles = config.voiceRoles || [
        { name: 'Talkative Parrot', minutes: 60 },
        { name: 'Voice Veteran', minutes: 300 },
        { name: 'Conversation King', minutes: 1000 },
        { name: 'Voice Legend', minutes: 3000 }
      ];
      
      // Check each voice role threshold
      for (const roleConfig of voiceRoles) {
        // Only award if user just crossed this threshold
        if (newMinutes >= roleConfig.minutes && oldMinutes < roleConfig.minutes) {
          await ensureRole(guild, roleConfig.name);
          const role = guild.roles.cache.find(r => r.name === roleConfig.name);
          
          if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role);
            if (generalChannel) {
              const emoji = roleConfig.minutes === 60 ? '🦜' :
                           roleConfig.minutes === 300 ? '🎤' :
                           roleConfig.minutes === 1000 ? '👑' : '⭐';
              const branding = config.branding || {};
              if (branding.voiceRoleEarnedMessage) {
                await generalChannel.send(formatMessage(branding.voiceRoleEarnedMessage, {
                  emoji,
                  member: member.toString(),
                  role: roleConfig.name,
                  minutes: roleConfig.minutes
                }));
              }
            }

            // Log audit
            if (auditLogger) {
              await auditLogger.logAction({
                guildId: guild.id,
                actionType: 'role_add',
                moderator: { id: 'SYSTEM', username: 'System' },
                target: member,
                reason: `Earned ${roleConfig.name} role through voice activity (${newMinutes} total minutes)`
              });
            }
          }
        }
      }

      // Check achievements for voice milestones
      await checkAchievements(member.id, guild, generalChannel ? generalChannel.id : null);
    }

  } catch (error) {
    errorWithTimestamp('Voice state update error:', error);
  }
});

// --- Global Error Handling ---
process.on('uncaughtException', (err) => {
  errorWithTimestamp('Uncaught Exception:', err);
  if (shutdownManager) {
    shutdownManager.emergencyShutdown('UNCAUGHT_EXCEPTION', err);
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  errorWithTimestamp('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log but don't shutdown for promise rejections unless critical
});

// --- Bot Login with Retry Logic ---
async function connectWithRetry(maxRetries = 10, baseDelay = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logWithTimestamp(`Login attempt ${attempt}/${maxRetries}...`);
      await client.login(process.env.DISCORD_TOKEN);
      logWithTimestamp('Successfully connected to Discord!');
      return true;
    } catch (error) {
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 300000); // Max 5 min delay
      errorWithTimestamp(`Login attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      
      if (attempt < maxRetries) {
        logWithTimestamp(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        errorWithTimestamp('All login attempts failed. Exiting for container restart...');
        process.exit(1); // Docker will restart the container
      }
    }
  }
}

logWithTimestamp('Enhanced Dimandem Bot starting up...');
connectWithRetry();