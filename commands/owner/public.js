const modeCommand = require('./mode');

module.exports = {
  name: 'public',
  category: 'owner',
  description: 'Allow everyone to use public bot commands',
  usage: '.public',
  ownerOnly: true,
  async execute(sock, msg, args, extra) {
    return modeCommand.execute(sock, msg, ['public'], extra);
  }
};