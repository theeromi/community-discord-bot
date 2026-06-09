// commands/poll.js - Create quick polls

module.exports = {
  name: 'poll',
  description: 'Create a quick poll with multiple options',
  usage: '!poll <question> | <option1> | <option2> | ...',
  
  async execute(message, args, db, EmbedBuilder) {
    try {
      if (args.length === 0) {
        return message.reply('❌ Usage: `!poll <question> | <option1> | <option2> | ...`\nExample: `!poll What\'s your favorite color? | Red | Blue | Green`');
      }
      
      // Parse poll data
      const pollData = args.join(' ').split('|').map(s => s.trim());
      
      if (pollData.length < 3) {
        return message.reply('❌ Please provide a question and at least 2 options!\nUsage: `!poll <question> | <option1> | <option2>`');
      }
      
      const question = pollData[0];
      const options = pollData.slice(1);
      
      if (options.length > 10) {
        return message.reply('❌ Maximum 10 poll options allowed!');
      }
      
      // Emoji numbers for reactions
      const emojiNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      
      // Build options text
      const optionsText = options.map((opt, i) => `${emojiNumbers[i]} ${opt}`).join('\n');
      
      const embed = new EmbedBuilder()
        .setColor(0x00D9FF)
        .setTitle('📊 Poll')
        .setDescription(`**${question}**\n\n${optionsText}`)
        .setFooter({ text: `Poll by ${message.author.username} • React to vote!` })
        .setTimestamp();
      
      const pollMessage = await message.channel.send({ embeds: [embed] });
      
      // Add reactions
      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(emojiNumbers[i]);
      }
      
      // Delete command message
      await message.delete().catch(() => {});
      
    } catch (error) {
      console.error('Error in poll command:', error);
      message.reply('❌ Error creating poll.');
    }
  }
};
