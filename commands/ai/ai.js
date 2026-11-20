/**
 * AI Chat Command - detailed responses from the configured AI providers
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
      
      const answer = await generateContent([{ text: [
        'Answer the user’s question clearly and thoroughly.',
        'Organize longer answers with short headings or bullet points when that improves readability.',
        'Include useful context, reasoning, examples, and practical steps when relevant, but avoid filler.',
        'If a detail is uncertain, say so instead of inventing facts.',
        `Question: ${question}`
      ].join('\n\n') }], {
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
        temperature: 0.6,
        maxOutputTokens: 1600,
        timeout: 30000,
        totalTimeout: 65000,
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
