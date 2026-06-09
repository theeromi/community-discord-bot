// commands/mystats.js — !mystats command (full profile view)

const config = require('../config');
const { formatCurrency } = require('../utils');

module.exports = {
  name: 'mystats',
  aliases: ['stats', 'me', 'profile'],
  description: 'Show your complete profile: XP, level, roles, economy, items, and progression.',
  usage: '!mystats [@user]',
  
  async execute(message, args, db, EmbedBuilder, context) {
    const economySystem = context?.economySystem || context;
    try {
      // Check if mentioning another user
      const targetUser = message.mentions.users.first() || message.author;
      const member = message.guild.members.cache.get(targetUser.id);
      
      if (!member) {
        return message.reply('❌ User not found in this server.');
      }

      // Get user stats from database
      const userStats = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM users WHERE id = ?`, [targetUser.id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!userStats) {
        return message.reply(`${targetUser.id === message.author.id ? 'You have' : `${targetUser.username} has`} no stats yet. Send a message or join voice chat to get started!`);
      }

      // Get economy data
      let economyData = { balance: 0, bank: 0, total_earned: 0, daily_streak: 0 };
      if (economySystem && economySystem.initialized) {
        try {
          economyData = await economySystem.getBalance(targetUser.id);
          const fullEconomy = await new Promise((resolve, reject) => {
            db.get(`SELECT * FROM economy WHERE user_id = ?`, [targetUser.id], (err, row) => {
              if (err) reject(err);
              else resolve(row || {});
            });
          });
          economyData = { ...economyData, ...fullEconomy };
        } catch (err) {
          console.error('Error fetching economy data:', err);
        }
      }

      // Get inventory/active items
      let activeBoosts = [];
      let badges = [];
      let cosmetics = [];
      if (economySystem && economySystem.initialized) {
        try {
          const inventory = await economySystem.getInventory(targetUser.id);
          const now = new Date();
          
          inventory.forEach(item => {
            const isExpired = item.expires_at && new Date(item.expires_at) < now;
            if (!isExpired) {
              if (item.category === 'boost') {
                const expiresAt = new Date(item.expires_at);
                const hoursLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60));
                activeBoosts.push(`${item.emoji} ${item.name} (${hoursLeft}h left)`);
              } else if (item.category === 'badge') {
                badges.push(`${item.emoji} ${item.name}`);
              } else if (item.category === 'cosmetic') {
                cosmetics.push(`${item.emoji} ${item.name}`);
              }
            }
          });
        } catch (err) {
          console.error('Error fetching inventory:', err);
        }
      }

      // Calculate progression role achievements
      const levelRoles = config.levelRoles || ['Level 1 Yardie', 'Level 2 Yardie', 'Level 3 Yardie', 'Level 4 Don', 'Level 5 Elder', 'Level 6 Legend', 'Level 7 OG'];
      const levelThresholds = config.levelThresholds || [100, 300, 600, 1000, 2500, 5000, 10000];
      const voiceRoles = config.voiceRoles || [];
      const messageRoles = config.messageRoles || [];

      // Find current level role
      let currentLevelRole = 'None';
      let nextLevelRole = null;
      let xpToNextLevel = null;
      for (let i = levelThresholds.length - 1; i >= 0; i--) {
        if (userStats.xp >= levelThresholds[i]) {
          currentLevelRole = levelRoles[i];
          if (i < levelThresholds.length - 1) {
            nextLevelRole = levelRoles[i + 1];
            xpToNextLevel = levelThresholds[i + 1] - userStats.xp;
          }
          break;
        }
      }

      // Find current voice role
      let currentVoiceRole = 'None';
      let nextVoiceRole = null;
      let minutesToNextVoice = null;
      for (let i = voiceRoles.length - 1; i >= 0; i--) {
        if (userStats.voiceMinutes >= voiceRoles[i].minutes) {
          currentVoiceRole = voiceRoles[i].name;
          if (i < voiceRoles.length - 1) {
            nextVoiceRole = voiceRoles[i + 1].name;
            minutesToNextVoice = voiceRoles[i + 1].minutes - userStats.voiceMinutes;
          }
          break;
        }
      }

      // Find current message role
      let currentMessageRole = 'None';
      let nextMessageRole = null;
      let messagesToNext = null;
      for (let i = messageRoles.length - 1; i >= 0; i--) {
        if (userStats.messages >= messageRoles[i].messages) {
          currentMessageRole = messageRoles[i].name;
          if (i < messageRoles.length - 1) {
            nextMessageRole = messageRoles[i + 1].name;
            messagesToNext = messageRoles[i + 1].messages - userStats.messages;
          }
          break;
        }
      }

      // Build the comprehensive stats embed
      const statsEmbed = new EmbedBuilder()
        .setTitle(`📊 ${targetUser.username}'s Complete Profile`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setColor(0x00AE86)
        .setTimestamp();

      // Core Stats
      const voiceHours = (userStats.voiceMinutes / 60).toFixed(1);
      statsEmbed.addFields(
        { name: '💎 Core Stats', value: `**XP:** ${userStats.xp.toLocaleString()}\n**Level:** ${userStats.level}\n**Messages:** ${userStats.messages.toLocaleString()}\n**Voice Time:** ${userStats.voiceMinutes.toLocaleString()} mins (${voiceHours}h)\n**Birthday:** ${userStats.birthday || 'Not set'}`, inline: true }
      );

      // Economy Stats
      const totalWealth = (economyData.balance || 0) + (economyData.bank || 0);
      const streakEmoji = economyData.daily_streak > 0 ? `🔥` : '';
      statsEmbed.addFields(
        { name: '💰 Economy', value: `**Balance:** ${formatCurrency(economyData.balance || 0, config)}\n**Bank:** ${formatCurrency(economyData.bank || 0, config)}\n**Total:** ${formatCurrency(totalWealth, config)}\n**Earned:** ${formatCurrency(economyData.total_earned || 0, config)}\n**Daily Streak:** ${economyData.daily_streak || 0} days ${streakEmoji}`, inline: true }
      );

      // Active Items
      let itemsText = '';
      if (activeBoosts.length > 0) {
        itemsText += `**Active Boosts:**\n${activeBoosts.join('\n')}\n\n`;
      }
      if (badges.length > 0) {
        itemsText += `**Badges:**\n${badges.join(', ')}\n\n`;
      }
      if (cosmetics.length > 0) {
        itemsText += `**Cosmetics:**\n${cosmetics.join(', ')}`;
      }
      if (!itemsText) {
        itemsText = 'No items owned\nVisit `!shop` to purchase items!';
      }
      statsEmbed.addFields(
        { name: '🎒 Items & Effects', value: itemsText, inline: false }
      );

      // Current Roles
      statsEmbed.addFields(
        { name: '🏆 Current Roles', value: `**Level Role:** ${currentLevelRole}\n**Voice Role:** ${currentVoiceRole}\n**Message Role:** ${currentMessageRole}`, inline: true }
      );

      // Next Goals
      let goalsText = '';
      if (nextLevelRole && xpToNextLevel) {
        goalsText += `**${nextLevelRole}:** ${xpToNextLevel.toLocaleString()} XP needed\n`;
      } else if (!nextLevelRole) {
        goalsText += `**Max Level:** Level 7 OG achieved! 👑\n`;
      }
      if (nextVoiceRole && minutesToNextVoice) {
        goalsText += `**${nextVoiceRole}:** ${minutesToNextVoice.toLocaleString()} mins needed\n`;
      } else if (!nextVoiceRole && currentVoiceRole !== 'None') {
        goalsText += `**Max Voice:** Voice Legend achieved! ⭐\n`;
      }
      if (nextMessageRole && messagesToNext) {
        goalsText += `**${nextMessageRole}:** ${messagesToNext.toLocaleString()} msgs needed`;
      } else if (!nextMessageRole && currentMessageRole !== 'None') {
        goalsText += `**Max Messages:** Message Master achieved! 💬`;
      }
      if (!goalsText) {
        goalsText = 'Start earning XP and voice time to unlock roles!';
      }
      statsEmbed.addFields(
        { name: '🎯 Next Goals', value: goalsText, inline: true }
      );

      statsEmbed.setFooter({ text: 'Use !balance, !inventory, or !richest for more details' });

      await message.channel.send({ embeds: [statsEmbed] });

    } catch (error) {
      console.error('Error in mystats command:', error);
      message.reply('❌ Error fetching stats. Please try again later.');
    }
  }
};
