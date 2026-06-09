// commands/achievements.js — view your achievements and badges

const config = require('../config');
const { currencyDisplay } = require('../utils');

module.exports = {
  name: 'achievements',
  aliases: ['badges', 'achieve'],
  description: 'View your achievements and progress',
  usage: '!achievements [@user]',
  
  async execute(message, args, db, EmbedBuilder) {
    try {
      const targetUser = message.mentions.users.first() || message.author;
      
      // Get user achievements
      const achievements = await new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC`,
          [targetUser.id],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });
      
      // Get user stats for progress
      const stats = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM users WHERE id = ?`,
          [targetUser.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      // Define available achievements with unlock criteria
      const allAchievements = [
        { id: 'first_message', name: '👋 First Steps', desc: 'Send your first message', check: (s) => s && s.messages >= 1 },
        { id: 'chatty', name: '💬 Chatty', desc: 'Send 100 messages', check: (s) => s && s.messages >= 100 },
        { id: 'chatterbox', name: '🗣️ Chatterbox', desc: 'Send 1,000 messages', check: (s) => s && s.messages >= 1000 },
        { id: 'legendary_talker', name: '👑 Legendary Talker', desc: 'Send 10,000 messages', check: (s) => s && s.messages >= 10000 },
        { id: 'level_5', name: '⭐ Rising Star', desc: 'Reach level 5', check: (s) => s && s.level >= 5 },
        { id: 'level_10', name: '🌟 Superstar', desc: 'Reach level 10', check: (s) => s && s.level >= 10 },
        { id: 'voice_active', name: '🎤 Voice Active', desc: 'Spend 60 minutes in voice', check: (s) => s && s.voiceMinutes >= 60 },
        { id: 'voice_enthusiast', name: '🎧 Voice Enthusiast', desc: 'Spend 500 minutes in voice', check: (s) => s && s.voiceMinutes >= 500 },
        { id: 'early_bird', name: '🌅 Early Bird', desc: 'Be online during morning message (automatic)' },
        { id: 'night_owl', name: '🦉 Night Owl', desc: 'Be online during evening message (automatic)' },
        { id: 'trivia_master', name: '🧠 Trivia Master', desc: 'Win 10 trivia games' },
        { id: 'money_maker', name: '💰 Money Maker', desc: `Earn 10,000 ${currencyDisplay(config)} total` },
        { id: 'generous', name: '🤝 Generous', desc: 'Gift money 5 times' },
        { id: 'gambler', name: '🎰 Gambler', desc: 'Play 50 mini-games' },
        { id: 'lucky_streak', name: '🍀 Lucky Streak', desc: 'Win 5 coinflips in a row' },
        { id: 'helpful', name: '⭐ Helpful', desc: 'Receive 10 reputation points' },
      ];
      
      // Check which achievements are unlocked
      const unlockedIds = achievements.map(a => a.achievement_id);
      const unlockedAchievements = allAchievements.filter(a => unlockedIds.includes(a.id));
      const lockedAchievements = allAchievements.filter(a => !unlockedIds.includes(a.id) && (!a.check || a.check(stats)));
      
      // Build embed
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`🏆 ${targetUser.username}'s Achievements`)
        .setDescription(`**${unlockedAchievements.length}/${allAchievements.length}** achievements unlocked`)
        .setThumbnail(targetUser.displayAvatarURL());
      
      if (unlockedAchievements.length > 0) {
        const unlockedText = unlockedAchievements
          .map(a => `${a.name}\n*${a.desc}*`)
          .join('\n\n');
        embed.addFields({ name: '✅ Unlocked', value: unlockedText, inline: false });
      }
      
      if (lockedAchievements.length > 0) {
        const lockedText = lockedAchievements
          .slice(0, 5) // Show first 5 locked
          .map(a => `${a.name}\n*${a.desc}*`)
          .join('\n\n');
        embed.addFields({ name: '🔒 In Progress', value: lockedText, inline: false });
      }
      
      embed.setFooter({ text: 'Keep playing to unlock more achievements!' })
        .setTimestamp();
      
      await message.reply({ embeds: [embed] });
      
    } catch (error) {
      console.error('Error in achievements command:', error);
      message.reply('❌ Error fetching achievements.');
    }
  }
};
