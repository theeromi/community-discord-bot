// Discord IDs are read from environment variables so the same code can run on
// any server without committing personal IDs. Set them in .env (see .env.example).
module.exports = {
  prefix: '!',
  generalChannelName: 'general-chat',
  generalChannelId: process.env.GENERAL_CHANNEL_ID || '',
  rulesChannelName: 'read-these-bumboclaat-rules',

  // Prayer Corner Forum & Threads (optional — leave .env values blank to disable)
  prayerCornerForumId: process.env.PRAYER_FORUM_ID || '',
  prayerThreads: {
    healingComfort:   process.env.PRAYER_HEALING_THREAD_ID    || '',
    encouragement:    process.env.PRAYER_ENCOURAGEMENT_THREAD_ID || '',
    testimony:        process.env.PRAYER_TESTIMONY_THREAD_ID  || '',
    prayerRequests:   process.env.PRAYER_REQUESTS_THREAD_ID   || '',
    strengthGuidance: process.env.PRAYER_STRENGTH_THREAD_ID   || ''
  },
  
  // Scheduled Hours
  dailyChallengeHour: 12, // 12:00 PM
  birthdayCheckHour: 9,   // 9:00 AM
  goodMorningHour: 8,     // 8:00 AM
  goodEveningHour: 17,    // 5:00 PM
  prayerPromptHour: 7,    // 7:00 AM
  holidayAnnouncementHour: 9, // 9:00 AM - Holiday announcements
  
  // News Feed Settings
  newsFeeds: {
    techNews: {
      channelName: 'tech-news-and-updates',
      channelId: process.env.TECH_NEWS_CHANNEL_ID || '',
      postHours: [8, 13, 20],  // Morning 8 AM, Afternoon 1 PM, Night 8 PM EST
      maxPostsPerUpdate: 5  // More posts per update for variety
    },
    codNews: {
      channelName: 'call-of-duty',
      channelId: process.env.COD_NEWS_CHANNEL_ID || '',
      postHours: [10, 16, 21],  // 10 AM, 4 PM, 9 PM EST
      maxPostsPerUpdate: 3
    }
  },
  
  // Level-based Roles & Thresholds (Extended System)
  levelThresholds: [100, 300, 600, 1000, 2500, 5000, 10000], // XP for Levels 1-7
  levelRoles: [
    'Level 1 Yardie',    // 100 XP
    'Level 2 Yardie',    // 300 XP
    'Level 3 Yardie',    // 600 XP
    'Level 4 Don',       // 1,000 XP
    'Level 5 Elder',     // 2,500 XP
    'Level 6 Legend',    // 5,000 XP
    'Level 7 OG'         // 10,000 XP
  ],
  
  // Voice-based Roles & Thresholds
  voiceRoles: [
    { name: 'Talkative Parrot', minutes: 60 },      // 1 hour
    { name: 'Voice Veteran', minutes: 300 },        // 5 hours
    { name: 'Conversation King', minutes: 1000 },   // 16.7 hours
    { name: 'Voice Legend', minutes: 3000 }         // 50 hours
  ],
  
  // Message-based Roles & Thresholds
  messageRoles: [
    { name: 'Chatter', messages: 100 },
    { name: 'Conversationalist', messages: 500 },
    { name: 'Social Butterfly', messages: 1000 },
    { name: 'Community Pillar', messages: 5000 },
    { name: 'Message Master', messages: 10000 }
  ],
  
  // Legacy role names (for backwards compatibility)
  talkativeParrotRole: 'Talkative Parrot',
  level1YardieRole: 'Level 1 Yardie',
  voiceRoleMinutes: 60, // Minutes in voice to earn Talkative Parrot

  dailyChallengeTimeout: 30000, // 30 seconds

  // ===========================================================================
  // Branding — community-themed strings the bot displays.
  //
  // Templates use {placeholder} syntax. Edit these to fit your server's voice.
  // Defaults below match the original Dimandem community. New operators who
  // run `cp config.example.js config.js` get neutral defaults instead.
  // ===========================================================================
  branding: {
    // Display name of the bot (shown in help embed titles/footers)
    botName: 'Dimandem Bot',
    // Display name of the community (used in templates as {community})
    communityName: 'Dimandem',
    // The "Watching X" status shown next to the bot in Discord member list
    activityStatus: 'Dimandem Chat 💬',
    // Embed title used by the !announce command
    announcementTitle: '📢 Announcement',

    // ----- Virtual currency -----
    currencySymbol: '$',          // Prefix shown before amounts
    currencyCode: 'JMD',          // Suffix shown after amounts
    currencyName: 'Jamaican Dollars',

    // Work scenarios for the !work command. Each entry: { job, min, max }.
    // Earnings are random within [min, max] inclusive.
    workScenarios: [
      { job: 'sold some ackee', min: 30, max: 60 },
      { job: 'cooked jerk chicken', min: 40, max: 80 },
      { job: 'harvested sugarcane', min: 25, max: 55 },
      { job: 'drove a taxi', min: 50, max: 100 },
      { job: 'sold coconuts at the beach', min: 35, max: 70 },
      { job: 'played dominoes (and won!)', min: 45, max: 90 },
      { job: 'picked mangoes', min: 20, max: 50 },
      { job: 'caught some fish', min: 40, max: 85 },
      { job: 'scammed grandma (she found out later)', min: 75, max: 150 },
      { job: 'robbed a bank 🏦', min: 200, max: 500 },
      { job: 'stole a goat and sold it', min: 60, max: 120 },
      { job: 'gave someone bad directions for a fee', min: 25, max: 55 },
      { job: 'sold "lucky" charms at the market', min: 40, max: 85 },
      { job: 'convinced tourists to buy fake artifacts', min: 80, max: 160 }
    ],

    // ----- Welcome messages -----
    // Placeholders: {member} (mention), {guild}, {rulesChannel}
    welcomeChannelMessage:
      '👋 Wah gwaan {member}! Welcome to **{guild}**!\n' +
      'Please make sure to read the rules in {rulesChannel} before you settle in. 🎉',
    // Placeholders: {username}, {guild}, {rulesChannel}, {generalChannel}
    welcomeDM:
      '👋 Welcome to **{guild}**, {username}!\n\n' +
      'Be sure to read the rules here: {rulesChannel}.\n' +
      'If you have any questions, feel free to ask in #{generalChannel} or tag a mod.\n\n' +
      'Enjoy your stay! 🎉',

    // ----- Level-up & activity messages -----
    // Placeholders: {member}, {role}, {boostEmoji}
    levelUpMessage: '🎉 Big up {member}! You leveled up to **{role}**!{boostEmoji} 🚀',
    // Placeholders: {member}, {role}, {minutes}, {emoji}
    voiceRoleEarnedMessage:
      '{emoji} Big up {member}! You\'ve earned the **{role}** role for {minutes}+ minutes in voice chat! 🎉',
    // Placeholders: {mention}
    birthdayChannelMessage: '🎂 Happy Birthday to {mention}! Big up from the whole crew! 🥳',
    // Placeholders: {username}
    birthdayDmMessage: '🎉 Happy Birthday, {username}! Hope you have a legendary day!',

    // ----- OpenAI !ask command -----
    aiSystemPrompt:
      'You are a witty, fun-loving Jamaican Discord bot for a Caribbean gaming community. ' +
      'Answer in Jamaican Patois when you feel like it, use slang and jokes, and don\'t be afraid to roast or flirt. ' +
      'Keep it real and lively, but avoid truly hateful or illegal stuff. Be bold, cheeky, and make the group laugh!',
    aiErrorMessage: 'Mi cyaan reach di AI right now, try again in a likkle bit!',

    // ----- Holiday announcements -----
    // The bot ships with a built-in calendar of US/Christian holidays whose
    // messages reference {community}. Set to false to skip them entirely.
    // To customise individual holidays, edit getHolidays() in index_enhanced.js.
    holidaysEnabled: true
  }
};