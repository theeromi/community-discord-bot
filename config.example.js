// =============================================================================
// dimandem-bot configuration template
//
// HOW TO USE:
//   1. Copy this file to config.js: `cp config.example.js config.js`
//   2. Replace every `REPLACE_ME` with a real value for your server.
//   3. config.js is committed today (legacy), but values you set are local —
//      a future refactor will move config.js into .gitignore.
//
// Discord IDs (snowflakes) look like: 695367230883496050
// Get them by enabling Developer Mode in Discord, then right-clicking the
// channel/role/server → Copy ID.
// =============================================================================

module.exports = {
  // Command prefix
  prefix: '!',

  // --- Channels ---
  generalChannelName: 'general-chat',         // fallback channel name
  generalChannelId: 'REPLACE_ME',             // primary channel ID
  rulesChannelName: 'rules',                  // rules channel name

  // --- Optional: Prayer Forum / Threads ---
  // Leave as REPLACE_ME or remove this block if you don't have a prayer forum.
  prayerCornerForumId: 'REPLACE_ME',
  prayerThreads: {
    healingComfort: 'REPLACE_ME',
    encouragement: 'REPLACE_ME',
    testimony: 'REPLACE_ME',
    prayerRequests: 'REPLACE_ME',
    strengthGuidance: 'REPLACE_ME'
  },

  // --- Scheduled hours (24h, server local TZ unless code overrides) ---
  dailyChallengeHour: 12,        // 12:00 PM
  birthdayCheckHour: 9,          // 9:00 AM
  goodMorningHour: 8,            // 8:00 AM
  goodEveningHour: 17,           // 5:00 PM
  prayerPromptHour: 7,           // 7:00 AM
  holidayAnnouncementHour: 9,    // 9:00 AM

  // --- News feeds (optional) ---
  // Each feed posts curated RSS links into a channel at scheduled hours.
  // Remove a feed entirely or set channelId to REPLACE_ME to disable it.
  newsFeeds: {
    techNews: {
      channelName: 'tech-news',
      channelId: 'REPLACE_ME',
      postHours: [8, 13, 20],
      maxPostsPerUpdate: 5
    },
    codNews: {
      channelName: 'call-of-duty',
      channelId: 'REPLACE_ME',
      postHours: [10, 16, 21],
      maxPostsPerUpdate: 3
    }
  },

  // --- Level-based roles (XP thresholds) ---
  // NOTE: role names are currently community-themed ("Yardie", "Don", etc.).
  // A future refactor will move these into a branding section so each
  // operator can theme them. Rename below to whatever fits your server.
  levelThresholds: [100, 300, 600, 1000, 2500, 5000, 10000],
  levelRoles: [
    'Level 1 Yardie',
    'Level 2 Yardie',
    'Level 3 Yardie',
    'Level 4 Don',
    'Level 5 Elder',
    'Level 6 Legend',
    'Level 7 OG'
  ],

  // --- Voice-activity roles ---
  voiceRoles: [
    { name: 'Talkative Parrot', minutes: 60 },
    { name: 'Voice Veteran', minutes: 300 },
    { name: 'Conversation King', minutes: 1000 },
    { name: 'Voice Legend', minutes: 3000 }
  ],

  // --- Message-count roles ---
  messageRoles: [
    { name: 'Chatter', messages: 100 },
    { name: 'Conversationalist', messages: 500 },
    { name: 'Social Butterfly', messages: 1000 },
    { name: 'Community Pillar', messages: 5000 },
    { name: 'Message Master', messages: 10000 }
  ],

  // --- Legacy aliases (kept for backwards compatibility) ---
  talkativeParrotRole: 'Talkative Parrot',
  level1YardieRole: 'Level 1 Yardie',
  voiceRoleMinutes: 60,

  // Daily challenge timeout in milliseconds
  dailyChallengeTimeout: 30000,

  // ===========================================================================
  // Branding — customise every community-facing string here.
  //
  // Templates use {placeholder} syntax. Available placeholders are listed
  // above each string. Rewrite them to fit your server's voice and language.
  // ===========================================================================
  branding: {
    // Display name of the bot (shown in help embed titles/footers)
    botName: 'Community Bot',
    // Display name of the community (used as {community} in templates)
    communityName: 'Our Community',
    // The "Watching X" status shown next to the bot in Discord member list
    activityStatus: 'Server Chat 💬',
    // Embed title used by the !announce command
    announcementTitle: '📢 Announcement',

    // ----- Virtual currency -----
    currencySymbol: '$',          // Prefix shown before amounts
    currencyCode: 'COIN',         // Suffix shown after amounts
    currencyName: 'Coins',

    // Work scenarios for the !work command. Each entry: { job, min, max }.
    // Earnings are random within [min, max] inclusive. Add as many as you like.
    workScenarios: [
      { job: 'delivered groceries', min: 30, max: 60 },
      { job: 'walked someone\'s dog', min: 25, max: 55 },
      { job: 'tested a new app', min: 40, max: 80 },
      { job: 'tutored a student', min: 50, max: 100 },
      { job: 'mowed a lawn', min: 35, max: 70 },
      { job: 'fixed a computer', min: 60, max: 120 },
      { job: 'streamed for a few hours', min: 20, max: 90 },
      { job: 'wrote a freelance article', min: 80, max: 160 }
    ],

    // ----- Welcome messages -----
    // Placeholders: {member} (mention), {guild}, {rulesChannel}
    welcomeChannelMessage:
      '👋 Welcome {member} to **{guild}**!\n' +
      'Please read the rules in {rulesChannel} before getting started. 🎉',
    // Placeholders: {username}, {guild}, {rulesChannel}, {generalChannel}
    welcomeDM:
      '👋 Welcome to **{guild}**, {username}!\n\n' +
      'Be sure to read the rules here: {rulesChannel}.\n' +
      'If you have any questions, ask in #{generalChannel} or tag a moderator.\n\n' +
      'Enjoy your stay! 🎉',

    // ----- Level-up & activity messages -----
    // Placeholders: {member}, {role}, {boostEmoji}
    levelUpMessage: '🎉 Congrats {member}! You leveled up to **{role}**!{boostEmoji} 🚀',
    // Placeholders: {member}, {role}, {minutes}, {emoji}
    voiceRoleEarnedMessage:
      '{emoji} Nice work {member}! You\'ve earned the **{role}** role for {minutes}+ minutes in voice chat! 🎉',
    // Placeholders: {mention}
    birthdayChannelMessage: '🎂 Happy Birthday to {mention}! 🥳',
    // Placeholders: {username}
    birthdayDmMessage: '🎉 Happy Birthday, {username}! Hope you have a great day!',

    // ----- OpenAI !ask command -----
    // System prompt sets the bot's personality. Edit freely.
    aiSystemPrompt:
      'You are a friendly, helpful Discord bot for an online community. ' +
      'Be concise, conversational, and clear. Avoid hateful or illegal content.',
    aiErrorMessage: 'Sorry, I can\'t reach the AI right now. Try again in a bit!',

    // ----- Holiday announcements -----
    // The bot ships with a built-in calendar of US/Christian holidays whose
    // messages reference {community}. Set to false to skip them entirely
    // (recommended if your community is in a different region or you don't
    // want auto-generated holiday posts).
    // To customise individual holidays, edit getHolidays() in index_enhanced.js.
    holidaysEnabled: false
  }
};
