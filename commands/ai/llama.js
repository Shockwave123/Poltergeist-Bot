const aiCommand = require('./ai');

module.exports = {
  ...aiCommand,
  name: 'llama',
  aliases: ['llama-ai', 'llm'],
  description: 'Chat with the configured AI provider',
  usage: '.llama <question>',
};