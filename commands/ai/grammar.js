/**
 * Grammar Command - Fix grammar and spelling
 * Usage: .grammar <text>
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'grammar',
  aliases: ['grammarcheck', 'fixgrammar'],
  category: 'ai',
  description: 'Fix grammar and spelling in text',
  usage: '.grammar <text>\nExample: .grammar I goes to school yesterday',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const text = args.join(' ').trim();

      if (!text) {
        return extra.reply(
          '📝 *Grammar Checker*\n\n' +
          'Usage: `.grammar <text>`\n' +
          'Example: `.grammar He does not like apples`'
        );
      }

      await extra.react('📝');

      const prompt = [
        'Fix the grammar and spelling in the following text.',
        'Return only the corrected text, no explanations.',
        '',
        '<text>',
        text,
        '</text>',
      ].join('\n');

      const answer = await generateContent([{ text: prompt }], {
        temperature: 0.1,
        maxOutputTokens: 800,
        timeout: 45000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: `✅ *Corrected:*\n${answer.trim()}`,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[grammar] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Grammar check failed: ${error.message}`);
    }
  }
};
