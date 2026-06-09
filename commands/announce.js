// commands/announce.js — post a formatted announcement, optionally pinging an audience

const config = require('../config');

module.exports = {
  name: 'announce',
  aliases: ['announcement', 'broadcast'],
  description: 'Post an announcement (moderator+). Optionally ping everyone, here, or a role.',
  usage: '!announce [#channel] <everyone|here|none|@role> <message>',

  async execute(message, args, db, EmbedBuilder) {
    // --- Permission gate (moderators and up) ---
    if (!message.member || !message.member.permissions.has('ManageMessages')) {
      return message.reply('❌ You need the **Manage Messages** permission to make announcements.');
    }

    if (args.length === 0) {
      return message.reply(
        '❌ Usage: `!announce [#channel] <everyone|here|none|@role> <message>`\n' +
        'Examples:\n' +
        '• `!announce everyone Server maintenance at 9pm tonight`\n' +
        '• `!announce here Quick heads up — event starting now`\n' +
        '• `!announce @Moderators Mod meeting in 10 minutes`\n' +
        '• `!announce none Welcome to our new members!` (no ping)\n' +
        '• `!announce #general everyone Big news everyone!`'
      );
    }

    const branding = config.branding || {};
    const workingArgs = [...args];

    // --- Optional leading #channel target ---
    let targetChannel = message.channel;
    const firstMentionedChannel = message.mentions.channels.first();
    if (firstMentionedChannel && /^<#\d+>$/.test(workingArgs[0])) {
      targetChannel = firstMentionedChannel;
      workingArgs.shift();
    }

    if (!targetChannel || !targetChannel.isTextBased?.()) {
      return message.reply('❌ I can only announce to a text channel.');
    }

    // --- Resolve audience from the next token ---
    let content = '';
    let allowedMentions = { parse: [] };
    const audienceToken = (workingArgs[0] || '').toLowerCase();
    const roleMention = message.mentions.roles.first();

    if (audienceToken === 'everyone') {
      content = '@everyone';
      allowedMentions = { parse: ['everyone'] };
      workingArgs.shift();
    } else if (audienceToken === 'here') {
      content = '@here';
      allowedMentions = { parse: ['everyone'] }; // @here is covered by the "everyone" parse flag
      workingArgs.shift();
    } else if (audienceToken === 'none' || audienceToken === 'silent') {
      workingArgs.shift();
    } else if (roleMention && /^<@&\d+>$/.test(workingArgs[0])) {
      content = `<@&${roleMention.id}>`;
      allowedMentions = { roles: [roleMention.id] };
      workingArgs.shift();
    } else {
      // Try to match a role by name (case-insensitive)
      const byName = message.guild.roles.cache.find(
        r => r.name.toLowerCase() === audienceToken && r.name !== '@everyone'
      );
      if (byName) {
        content = `<@&${byName.id}>`;
        allowedMentions = { roles: [byName.id] };
        workingArgs.shift();
      }
      // Otherwise: no recognised audience — treat everything as the message, no ping
    }

    const announcementText = workingArgs.join(' ').trim();
    if (!announcementText) {
      return message.reply('❌ Please include the announcement text after the audience.');
    }

    // --- Permission sanity checks ---
    const me = message.guild.members.me;
    if (!targetChannel.permissionsFor(me)?.has('SendMessages')) {
      return message.reply(`❌ I don't have permission to send messages in ${targetChannel}.`);
    }
    const needsMentionPerm = content === '@everyone' || content === '@here' || allowedMentions.roles;
    if (needsMentionPerm && !targetChannel.permissionsFor(me)?.has('MentionEveryone')) {
      // Role pings to a mentionable role still work without this perm, but @everyone/@here won't.
      if (content === '@everyone' || content === '@here') {
        return message.reply('❌ I need the **Mention @everyone, @here, and All Roles** permission to ping that audience.');
      }
    }

    // --- Build and send ---
    const embed = new EmbedBuilder()
      .setTitle(branding.announcementTitle || '📢 Announcement')
      .setDescription(announcementText)
      .setColor(0xFFD700)
      .setFooter({ text: `Announced by ${message.author.username}` })
      .setTimestamp();

    try {
      await targetChannel.send({
        content: content || undefined,
        embeds: [embed],
        allowedMentions
      });

      // Acknowledge in the original channel if we posted elsewhere
      if (targetChannel.id !== message.channel.id) {
        await message.reply(`✅ Announcement posted in ${targetChannel}.`);
      }

      // Clean up the command message
      await message.delete().catch(() => {});
    } catch (error) {
      console.error('Error in announce command:', error);
      await message.reply('❌ Failed to post the announcement. Check my permissions and try again.');
    }
  }
};
