module.exports = {
  name: 'ping',
  description: 'Check bot latency',
  usage: '!ping',
  async execute(message) {
    const sent = await message.channel.send('Pinging...');
    sent.edit(`🏓 Pong! Roundtrip latency: ${sent.createdTimestamp - message.createdTimestamp}ms`);
  }
};
