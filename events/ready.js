const config = require('../config');

module.exports = {
  name: 'ready',
  once: true,
  execute(client, logWithTimestamp) {
    logWithTimestamp(`✅ Logged in as ${client.user.tag}`);
    const status = (config.branding && config.branding.activityStatus) || 'the chat';
    client.user.setActivity(status, { type: 'WATCHING' });
  }
};
