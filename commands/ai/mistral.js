const aiCommand = require('./ai');

module.exports = {
  ...aiCommand,
  name: 'mistral',
  aliases: ['mistral-ai'],
  description: 'Chat with the configured AI provider',
  usage: '.mistral <question>',
};