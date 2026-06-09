module.exports = {
  name: 'info',
  description: 'Show the rules channel (alias for !rules)',
  usage: '!info',
  async execute(message) {
    const rulesChannel = message.guild.channels.cache.find(ch => ch.name === 'read-these-bumboclaat-rules');
    if (rulesChannel) {
      return message.channel.send(`📌 Please make sure to read the rules here: ${rulesChannel}`);
    } else {
      return message.channel.send("⚠️ Couldn't find the rules channel.");
    }
  }
};
