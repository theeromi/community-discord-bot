// commands/giveaway.js - Create and manage giveaways

module.exports = {
  name: 'giveaway',
  description: 'Create and manage giveaways',
  usage: '!giveaway create <duration> <prize> | !giveaway end <messageId>',
  
  async execute(message, args, db, EmbedBuilder) {
    try {
      // Check permissions
      const { PermissionsBitField } = require('discord.js');
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply('❌ You need Manage Server permission to create giveaways!');
      }
      
      const subcommand = args[0]?.toLowerCase();
      
      if (subcommand === 'create') {
        await createGiveaway(message, args.slice(1), db, EmbedBuilder);
      } else if (subcommand === 'end') {
        await endGiveaway(message, args.slice(1), db, EmbedBuilder);
      } else {
        return message.reply('❌ Usage: `!giveaway create <time> <prize>` or `!giveaway end <messageId>`\nExample: `!giveaway create 1h Nitro Classic`');
      }
      
    } catch (error) {
      console.error('Error in giveaway command:', error);
      message.reply('❌ Error with giveaway command.');
    }
  }
};

async function createGiveaway(message, args, db, EmbedBuilder) {
  if (args.length < 2) {
    return message.reply('❌ Usage: `!giveaway create <time> <prize>`\nExample: `!giveaway create 1h Nitro Classic`');
  }
  
  const timeStr = args[0].toLowerCase();
  const prize = args.slice(1).join(' ');
  
  // Parse time
  const timeMatch = timeStr.match(/^(\d+)(m|h|d)$/);
  if (!timeMatch) {
    return message.reply('❌ Invalid time format! Use: 30m (minutes), 2h (hours), or 1d (days)');
  }
  
  const amount = parseInt(timeMatch[1]);
  const unit = timeMatch[2];
  
  let minutes;
  switch (unit) {
    case 'm': minutes = amount; break;
    case 'h': minutes = amount * 60; break;
    case 'd': minutes = amount * 60 * 24; break;
  }
  
  if (minutes < 1 || minutes > 10080) {
    return message.reply('❌ Duration must be between 1 minute and 7 days!');
  }
  
  const endTime = new Date(Date.now() + minutes * 60 * 1000);
  
  // Create giveaway embed
  const embed = new EmbedBuilder()
    .setColor(0xFF69B4)
    .setTitle('🎉 GIVEAWAY 🎉')
    .setDescription(`**Prize:** ${prize}\n\n React with 🎉 to enter!`)
    .addFields(
      { name: '⏰ Ends', value: `<t:${Math.floor(endTime.getTime() / 1000)}:R>`, inline: true },
      { name: '👤 Host', value: message.author.toString(), inline: true }
    )
    .setFooter({ text: 'Good luck!' })
    .setTimestamp(endTime);
  
  const giveawayMsg = await message.channel.send({ embeds: [embed] });
  await giveawayMsg.react('🎉');
  
  // Store in database
  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO giveaways (message_id, channel_id, guild_id, prize, host_id, end_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [giveawayMsg.id, message.channel.id, message.guild.id, prize, message.author.id, endTime.toISOString()],
      function(err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
  
  await message.delete().catch(() => {});
}

async function endGiveaway(message, args, db, EmbedBuilder) {
  const messageId = args[0];
  
  if (!messageId) {
    return message.reply('❌ Please provide the giveaway message ID!\nUsage: `!giveaway end <messageId>`');
  }
  
  // Get giveaway from database
  const giveaway = await new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM giveaways WHERE message_id = ? AND ended = 0`,
      [messageId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
  
  if (!giveaway) {
    return message.reply('❌ Giveaway not found or already ended!');
  }
  
  try {
    // Fetch the giveaway message
    const channel = await message.client.channels.fetch(giveaway.channel_id);
    const giveawayMessage = await channel.messages.fetch(giveaway.message_id);
    
    // Get reactions
    const reaction = giveawayMessage.reactions.cache.get('🎉');
    if (!reaction || reaction.count <= 1) {
      await message.reply('❌ No valid entries for this giveaway!');
      return;
    }
    
    // Get users who reacted (excluding bots)
    const users = await reaction.users.fetch();
    const entries = users.filter(u => !u.bot);
    
    if (entries.size === 0) {
      await message.reply('❌ No valid entries for this giveaway!');
      return;
    }
    
    // Pick random winner
    const winner = entries.random();
    
    // Update database
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE giveaways SET ended = 1, winner_id = ? WHERE message_id = ?`,
        [winner.id, messageId],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    // Update giveaway message
    const winnerEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🎉 GIVEAWAY ENDED 🎉')
      .setDescription(`**Prize:** ${giveaway.prize}\n\n**Winner:** ${winner}`)
      .addFields({ name: '👤 Host', value: `<@${giveaway.host_id}>`, inline: true })
      .setFooter({ text: 'Congratulations!' })
      .setTimestamp();
    
    await giveawayMessage.edit({ embeds: [winnerEmbed] });
    await giveawayMessage.reply(`🎉 Congratulations ${winner}! You won **${giveaway.prize}**!`);
    
  } catch (error) {
    console.error('Error ending giveaway:', error);
    message.reply('❌ Error ending giveaway. Make sure the message ID is correct.');
  }
}
