const aikeyCmd = require('../ai/aikey');

module.exports = {
  name: 'googleai',
  aliases: ['gemini', 'openrouter'],
  category: 'ai',
  description: 'Manage Google Gemini or OpenRouter API key',
  usage: '.googleai | .googleai set <key>',
  execute: aikeyCmd.execute,
};
