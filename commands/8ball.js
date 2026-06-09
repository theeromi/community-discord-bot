module.exports = {
  name: '8ball',
  description: 'Ask the magic 8-ball a question',
  usage: '!8ball <question>',
  async execute(message) {
    const responses = [
      'It is certain.', 'Without a doubt.', 'Yes – definitely.', 'Reply hazy, try again.',
      'Ask again later.', 'Cannot predict now.', 'Don’t count on it.', 'Very doubtful.'
    ];
    const reply = responses[Math.floor(Math.random() * responses.length)];
    message.reply(`🎱 ${reply}`);
  }
};
