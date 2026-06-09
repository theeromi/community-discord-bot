// commands/help.js — !help command

const config = require('../config');
const { formatCurrency, currencyDisplay, botName } = require('../utils');

module.exports = {
  name: 'help',
  description: 'Show all available commands and features.',
  aliases: ['h', 'commands'],

  async execute(message, args, db, EmbedBuilder) {
    if (args.length > 0) {
      return await showCategoryHelp(message, args[0].toLowerCase(), EmbedBuilder);
    }

    const name = botName(config);

    const helpEmbed = new EmbedBuilder()
      .setTitle(`📜 ${name} Help`)
      .setDescription(`**Welcome to ${name}!** 🎉\n\nA complete Discord bot with XP system, economy, roles, trivia, and more!\n\n**Use \`!help <category>\` for detailed commands:**`)
      .addFields(
        {
          name: '👥 **User & Stats**',
          value: '`!help user` - Profile, stats, progression',
          inline: true
        },
        {
          name: '💰 **Economy** 🆕',
          value: `\`!help economy\` - ${currencyDisplay(config)} currency system`,
          inline: true
        },
        {
          name: '🏆 **Roles & Rewards** 🆕',
          value: '`!help roles` - 17 automated roles',
          inline: true
        },
        {
          name: '🎮 **Fun & Games** 🆕',
          value: '`!help fun` - Trivia, mini-games, polls',
          inline: true
        },
        {
          name: '🤝 **Social & Community** 🆕',
          value: '`!help social` - Rep, achievements, giveaways',
          inline: true
        },
        {
          name: '🛡️ **Moderation**',
          value: '`!help mod` - Moderation tools',
          inline: true
        },
        {
          name: 'ℹ️ **Information**',
          value: '`!help info` - Server & user info',
          inline: true
        },
        {
          name: '⚙️ **Admin Tools**',
          value: '`!help admin` - Admin features',
          inline: true
        },
        {
          name: '🤖 **AI Features**',
          value: '`!help ai` - OpenAI integration',
          inline: true
        },
        {
          name: '🛒 **Shop** 🆕',
          value: '`!help shop` - Buy boosts & items',
          inline: true
        }
      )
      .addFields(
        {
          name: '⏰ **Automatic Daily Events**',
          value: `• **7:00 AM** - Prayer prompts\n• **8:00 AM** - Good morning with AI quotes\n• **9:00 AM** - Birthday & holiday announcements\n• **12:00 PM** - Daily trivia challenge (100 XP + ${formatCurrency(50, config)})\n• **5:00 PM** - Good evening safety reminders`,
          inline: false
        },
        {
          name: '✨ **Quick Start**',
          value: `1. \`!mystats\` - View your profile\n2. \`!daily\` - Claim daily ${currencyDisplay(config)}\n3. \`!work\` - Earn more money\n4. \`!shop\` - Browse items\n5. \`!trivia\` - Win rewards!\n6. \`!achievements\` - Check your badges\n7. \`!rep @user\` - Give someone props`,
          inline: false
        },
        {
          name: '🆕 **New in Phase 3**',
          value: '**Social:** `!rep`, `!achievements`, `!giveaway`, `!poll`, `!afk`, `!remindme`\n**Games:** `!coinflip`, `!slots`, `!blackjack`\n**More:** 17 automated roles, achievement system, reputation tracking!',
          inline: false
        }
      )
      .setColor(0x00AE86)
      .setFooter({ text: `${name} • Use !help <category> for details` });

    return message.channel.send({ embeds: [helpEmbed] });
  }
};

async function showCategoryHelp(message, category, EmbedBuilder) {
  let embed;

  switch (category) {
    case 'user':
    case 'profile':
    case 'stats':
      embed = new EmbedBuilder()
        .setTitle('👥 User & Stats Commands')
        .setDescription('Commands for managing your profile and viewing progression:')
        .addFields(
          { name: '`!mystats [@user]`', value: '🆕 **Complete profile** - XP, level, roles, economy, items, and next goals' },
          { name: '`!profile [@user]`', value: 'View profile with XP, level, birthday, and stats' },
          { name: '`!profilecard`', value: 'Generate a detailed profile card image' },
          { name: '`!leaderboard`', value: 'Top 10 users by XP in the server' },
           { name: '`!voiceleaderboard`', value: 'Top 10 users by voice activity time\nAliases: `!voicelb`, `!vclb`, `!voiceboard`' },
          { name: '`!setbirthday YYYY-MM-DD`', value: 'Set your birthday for announcements (e.g., `!setbirthday 2000-05-21`)' },
          { name: '`!afk [message]`', value: 'Set yourself as AFK; removed automatically on your next message' },
          { name: '`!remindme <time> <message>`', value: 'Set a personal reminder (1m-7d). Example: `!remindme 30m Check oven`' },
          { name: '`!achievements [@user]`', value: 'View unlocked and in-progress achievements/badges' },
          { name: '`!rep @user [reason]`', value: 'Give a rep point every 24h to someone helpful' }
        )
        .setColor(0x4CAF50);
      break;

    case 'economy':
    case 'money':
    case 'currency':
    case 'jmd':
      {
        const branding = config.branding || {};
        const cur = currencyDisplay(config);
        const curName = branding.currencyName || 'Coins';
        const workScenarioCount = (branding.workScenarios && branding.workScenarios.length) || 8;
        embed = new EmbedBuilder()
          .setTitle('💰 Economy System')
          .setDescription(`Virtual currency system with ${cur} (${curName}):`)
          .addFields(
            { name: '`!balance [@user]`', value: `Check your ${cur} balance (cash + bank)\nAliases: \`!bal\`, \`!money\`, \`!cash\`` },
            { name: '`!bank`', value: '🏦 Manage your bank account\n• `!bank deposit <amount|all>` - Save money\n• `!bank withdraw <amount|all>` - Get cash\n• Shortcuts: `!deposit`, `!withdraw`' },
            { name: '`!daily`', value: `💵 Claim ${formatCurrency(100, config)}–${formatCurrency(300, config)} every 20 hours\n• Base reward: ${formatCurrency(100, config)}\n• Streak bonus: +${formatCurrency(10, config)} per day (max ${formatCurrency(200, config)})\n• Build streaks for bigger rewards!` },
            { name: '`!work`', value: `💼 Work to earn ${formatCurrency(20, config)}–${formatCurrency(100, config)} (1-hour cooldown)\n• ${workScenarioCount} work scenarios\n• Random earnings per job` },
            { name: '`!gift @user <amount>`', value: `🎁 Send ${cur} to another user (min ${formatCurrency(10, config)})\nAliases: \`!give\`, \`!send\`, \`!pay\`` },
            { name: '`!richest`', value: '🏆 View top 10 wealthiest members\nAliases: `!rich`, `!baltop`, `!moneylb`' },
            { name: '**Ways to Earn**', value: `• Daily claims with streaks\n• Work every hour\n• Win trivia challenges (+${formatCurrency(50, config)})\n• Receive gifts from friends` }
          )
          .setColor(0xFFD700);
      }
      break;

    case 'shop':
    case 'store':
    case 'buy':
      embed = new EmbedBuilder()
        .setTitle('🛒 Shop & Inventory')
        .setDescription(`Purchase items with your ${currencyDisplay(config)}:`)
        .addFields(
          { name: '`!shop [category]`', value: 'Browse all available items\n• Categories: boost, cosmetic, badge' },
          { name: '`!shop buy <item_id>`', value: 'Purchase an item from the shop' },
          { name: '`!inventory [@user]`', value: 'View your owned items and active boosts\nAliases: `!inv`, `!items`' },
          { name: '**Available Items**', value: '**XP Boosts:**\n⚡ 24h Boost - $500 (2x XP)\n🔥 7d Boost - $2,500 (2x XP)\n\n**Name Colors:**\n🔴 Red - $1,000\n🟡 Gold - $1,500\n🟣 Purple - $2,000\n\n**Badges:**\n⭐ Star - $750\n👑 Crown - $1,000\n🔥 Fire - $500' }
        )
        .setColor(0x9C27B0);
      break;

    case 'roles':
    case 'rewards':
    case 'progression':
      {
        const levelRoles = config.levelRoles || [];
        const levelThresholds = config.levelThresholds || [];
        const voiceRoles = config.voiceRoles || [];
        const messageRoles = config.messageRoles || [];

        const levelText = levelRoles
          .map((name, i) => `• ${name} - ${(levelThresholds[i] ?? '?').toLocaleString()} XP`)
          .join('\n') || 'No level roles configured.';

        const voiceText = voiceRoles
          .map(r => `• ${r.name} - ${r.minutes} mins`)
          .join('\n') || 'No voice roles configured.';

        const messageText = messageRoles
          .map(r => `• ${r.name} - ${r.messages.toLocaleString()} messages`)
          .join('\n') || 'No message roles configured.';

        const totalTiers = levelRoles.length + voiceRoles.length + messageRoles.length;

        embed = new EmbedBuilder()
          .setTitle('🏆 Roles & Progression')
          .setDescription(`${totalTiers} automated role tiers based on your activity:`)
          .addFields(
            { name: `**Level Roles (XP-based) - ${levelRoles.length} Tier${levelRoles.length === 1 ? '' : 's'}**`, value: levelText },
            { name: `**Voice Roles (Voice Time) - ${voiceRoles.length} Tier${voiceRoles.length === 1 ? '' : 's'}**`, value: voiceText },
            { name: `**Message Roles (Chat Activity) - ${messageRoles.length} Tier${messageRoles.length === 1 ? '' : 's'}**`, value: messageText },
            { name: '**How It Works**', value: '✅ Roles assigned automatically\n✅ All qualifying roles awarded\n✅ Progress tracked cumulatively\n✅ No manual role management needed!' }
          )
          .setColor(0xE91E63);
      }
      break;

    case 'fun':
    case 'games':
    case 'game':
      embed = new EmbedBuilder()
        .setTitle('🎮 Fun & Games')
        .setDescription('Entertainment commands and interactive features:')
        .addFields(
          { name: '`!trivia`', value: `🎯 Start a trivia challenge\n• Win: +100 XP & ${formatCurrency(50, config)}\n• 30-second answer window\n• Auto-scheduled daily at 12:00 PM\nAliases: \`!dailytest\`, \`!challenge\`, \`!quiz\`` },
          { name: '`!twotruths`', value: '🎲 Play Two Truths and a Lie for XP rewards' },
          { name: '`!8ball <question>`', value: '🔮 Ask the magic 8-ball a yes/no question' },
          { name: '**🎰 Mini-Games**', value: `Bet ${currencyDisplay(config)} and test your luck:` },
          { name: '`!coinflip <heads/tails> <amount>`', value: `🪙 Bet ${formatCurrency(10, config)}–${formatCurrency(1000, config)} on a coin flip\n• 50/50 chance\n• Double your money if you win!` },
          { name: '`!slots <amount>`', value: `🎰 Slot machine (bet ${formatCurrency(10, config)}–${formatCurrency(500, config)})\n• Match symbols for multipliers\n• Jackpots up to 20x your bet!` },
          { name: '`!blackjack <amount>`', value: `🃏 Quick blackjack vs dealer (bet ${formatCurrency(10, config)}–${formatCurrency(1000, config)})\n• Get closest to 21 to win\n• Beat the dealer and double up!` },
          { name: '`!poll <question> | <opt1> | <opt2>...`', value: '📊 Create a quick poll (up to 10 options)\n• Reaction-based voting\n• Great for community decisions!' },
          { name: '**Voice Activity**', value: '🎤 Earn voice roles by spending time in voice channels\n• Tracks total time across sessions\n• 4 progression tiers' }
        )
          .addFields(
            { name: '`!voiceleaderboard`', value: '🎤 View top members by total voice time\nAliases: `!voicelb`, `!vclb`, `!voiceboard`' }
          )
        .setColor(0xFF9800);
      break;

    case 'social':
    case 'community':
    case 'socials':
      embed = new EmbedBuilder()
        .setTitle('🤝 Social & Community Features (NEW!)')
        .setDescription('Connect with your community and track your achievements:')
        .addFields(
          { name: '`!rep @user [reason]`', value: '⭐ Give reputation to helpful members\n• 24-hour cooldown per giver\n• Shows appreciation for helpful actions\n• Earn the "Helpful" achievement at 10 rep points\nAliases: `!reputation`, `!thanks`, `!thank`' },
          { name: '`!achievements [@user]`', value: '🏆 View achievements and badges\n• See unlocked achievements\n• Track progress toward new ones\n• 15+ achievements to unlock!\nAliases: `!badges`, `!achieve`' },
          { name: '`!giveaway create <time> <prize>`', value: '🎉 Create a timed giveaway\n• Users react to enter\n• Automatic winner selection\n• Requires Manage Server permission\nExample: `!giveaway create 1h Nitro Classic`' },
          { name: '`!giveaway end <messageId>`', value: '🎁 End a giveaway early and pick winner\n• Useful for manual control\n• Requires Manage Server permission' },
          { name: '`!poll <question> | <opt1> | <opt2>...`', value: '📊 Create quick community polls\n• Up to 10 options\n• Reaction-based voting\n• Great for decisions!\nExample: `!poll Favorite color? | Red | Blue | Green`' },
          { name: '`!afk [message]`', value: '💤 Set your AFK status\n• Auto-reply when mentioned\n• Removed when you send a message\n• Shows time since you went AFK' },
          { name: '`!remindme <time> <message>`', value: '⏰ Set personal reminders\n• Time formats: 30m, 2h, 1d\n• Max 7 days ahead\n• Reminders sent in the same channel\nExample: `!remindme 2h Check the oven`\nAliases: `!remind`, `!reminder`' },
          { name: '**Achievement Types**', value: '🏅 **Message Milestones:** First message, 100, 1K, 10K messages\n⭐ **Level Achievements:** Level 5, Level 10\n🎤 **Voice Activity:** 60 mins, 500 mins in voice\n💰 **Economy:** Money maker, generous, gambler\n🧠 **Skills:** Trivia master, lucky streak, helpful' }
        )
        .setColor(0x9C27B0);
      break;

    case 'mod':
    case 'moderation':
      embed = new EmbedBuilder()
        .setTitle('🛡️ Moderation Tools')
        .setDescription('Moderation commands for maintaining order:')
        .addFields(
          { name: '`!ban @user [reason]`', value: 'Permanently ban a user from the server' },
          { name: '`!kick @user [reason]`', value: 'Remove a user from the server' },
          { name: '`!mute @user [reason]`', value: 'Prevent a user from sending messages' },
          { name: '`!unmute @user [reason]`', value: 'Remove mute from a user' },
          { name: '`!clear <1-100> [reason]`', value: 'Delete multiple messages from current channel' },
          { name: '`!slowmode <0-21600>`', value: 'Set channel slowmode in seconds (0 to disable)' },
          { name: '`!announce <audience> <message>`', value: 'Post an announcement. Audience: `everyone`, `here`, `none`, or `@role`. Optional leading `#channel` to post elsewhere.\nAliases: `!announcement`, `!broadcast`' },
          { name: '`!bulk <action>`', value: 'Mass moderation actions (see `!help bulk`)' }
        )
        .setColor(0xF44336);
      break;

    case 'bulk':
      embed = new EmbedBuilder()
        .setTitle('⚡ Bulk Operations')
        .setDescription('Mass moderation tools (use carefully!):')
        .addFields(
          { name: '`!bulk purge <count>`', value: 'Delete multiple messages at once' },
          { name: '`!bulk ban @user1 @user2...`', value: 'Ban multiple users simultaneously' },
          { name: '`!bulk kick @user1 @user2...`', value: 'Kick multiple users at once' },
          { name: '**Safety Note**', value: 'Bulk operations require admin permissions and have built-in limits' }
        )
        .setColor(0x9C27B0);
      break;

    case 'info':
    case 'information':
      embed = new EmbedBuilder()
        .setTitle('ℹ️ Information Commands')
        .setDescription('Commands for getting server and user information:')
        .addFields(
          { name: '`!serverinfo`', value: 'Detailed information about the current server' },
          { name: '`!userinfo [@user]`', value: 'Detailed information about a user' },
          { name: '`!ping`', value: 'Check bot latency and response time' },
          { name: '`!rules`', value: 'Display server rules and guidelines' },
          { name: '`!info`', value: 'General server information and announcements' },
          { name: '`!health` / `!status`', value: 'Bot health status (admin/mod only)' },
          { name: '`!analytics`', value: 'Server usage statistics (admin only)' }
        )
        .setColor(0x2196F3);
      break;

    case 'admin':
    case 'administrator':
      embed = new EmbedBuilder()
        .setTitle('⚙️ Admin Tools')
        .setDescription('Administrative commands (admin only):')
        .addFields(
          { name: '`!addxp @user <amount>`', value: 'Add XP to a user (1-10000)' },
          { name: '`!removexp @user <amount>`', value: 'Remove XP from a user' },
          { name: '`!backup [reason]`', value: 'Create manual database backup' },
          { name: '`!health` / `!status`', value: 'System health and performance metrics' },
          { name: '`!analytics`', value: 'Server statistics and analytics' },
          { name: '**Community Features**', value: 'See `!help social` for: giveaways, reputation, achievements, polls, reminders, AFK' },
          { name: '**Auto-Features**', value: 'Daily backups, analytics generation, and cleanup run automatically' }
        )
        .setColor(0x607D8B);
      break;

    case 'ai':
    case 'openai':
      embed = new EmbedBuilder()
        .setTitle('🤖 AI Features')
        .setDescription('OpenAI-powered intelligent features:')
        .addFields(
          { name: '`!ask <question>`', value: 'Ask the AI assistant anything' },
          { name: '**Morning Messages**', value: 'AI-generated motivational quotes at 8:00 AM' },
          { name: '**Evening Messages**', value: 'AI-generated safety reminders at 5:00 PM' },
          { name: '**Smart Context**', value: 'AI understands server context and community culture' }
        )
        .setColor(0x00BCD4);
      break;

    default:
      embed = new EmbedBuilder()
        .setTitle('❌ Unknown Category')
        .setDescription('**Available categories:**\n`user`, `economy`, `shop`, `roles`, `fun`, `social`, `mod`, `bulk`, `info`, `admin`, `ai`\n\n**🆕 New categories:** `social` - Community features, `fun` - Games & entertainment')
        .setColor(0xFF6B6B);
  }

  return message.channel.send({ embeds: [embed] });
}
