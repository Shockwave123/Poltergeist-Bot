/**
 * AI Chat Command - ChatGPT-style responses
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'ai',
  aliases: ['chat', 'chatgpt', 'ask'],
  category: 'ai',
  description: 'Chat with AI (ChatGPT-style)',
  usage: '.ai <question>',
  
  async execute(sock, msg, args, extra) {
    try {
      const commandName = extra.commandName || 'ai';
      if (args.length === 0) {
        return extra.reply(`❌ Usage: ${extra.prefix || '.'}${commandName} <question>\n\nExample: ${extra.prefix || '.'}${commandName} What is the capital of France?`);
      }
      
      const question = args.join(' ');
      
      const answer = await generateContent([{ text: `Answer this question clearly and naturally. Keep it concise unless detail is needed.\n\n${question}` }], {
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
        temperature: 0.6,
        maxOutputTokens: 600,
        timeout: 12000,
        totalTimeout: 22000,
        fast: true,
      });
      await extra.reply(answer);
      
    } catch (error) {
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ AI Error: ${error.message}`);
    }
  }
};
