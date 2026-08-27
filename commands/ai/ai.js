/**
 * AI Chat Command - ChatGPT-style responses
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'ai',
  aliases: ['gpt', 'chatgpt', 'ask'],
  category: 'ai',
  description: 'Chat with AI (ChatGPT-style)',
  usage: '.ai <question>',
  
  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply('❌ Usage: .ai <question>\n\nExample: .ai What is the capital of France?');
      }
      
      const question = args.join(' ');
      
      const answer = await generateContent([{ text: `Answer this question clearly and naturally. Keep it concise unless detail is needed.\n\n${question}` }], {
        apiKey: getKey(extra.sender),
        temperature: 0.55,
        maxOutputTokens: 700,
      });
      await extra.reply(answer);
      
    } catch (error) {
      await extra.reply(`❌ AI Error: ${error.message}`);
    }
  }
};
