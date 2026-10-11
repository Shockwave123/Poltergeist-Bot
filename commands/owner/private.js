const modeCommand = require('./mode');

module.exports = {
  name: 'private',
  category: 'owner',
  description: 'Restrict bot commands to the owner and sudo users',
  usage: '.private',
  ownerOnly: true,
  async execute(sock, msg, args, extra) {
    return modeCommand.execute(sock, msg, ['private'], extra);
  }
};