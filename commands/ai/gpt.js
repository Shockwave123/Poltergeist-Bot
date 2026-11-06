const aiCommand = require('./ai');

module.exports = {
  ...aiCommand,
  name: 'gpt',
  aliases: [],
  description: 'Chat with the configured AI provider',
  usage: '.gpt <question>',
};