/**
 * Explain Command - ELI5-style explanation of any topic
 * Usage: .explain <topic>
 * Example: .explain quantum computing
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'explain',
  aliases: ['eli5', 'explainlikeimfive'],
  category: 'ai',
  description: 'Explain any topic in simple terms (ELI5)',
  usage: '.explain <topic>\nExample: .explain how blockchain works',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const topic = args.join(' ').trim();

      if (!topic) {
        return extra.reply(
          '📚 *Explain Like I\'m 5*\n\n' +
          'Usage: `.explain <topic>`\n' +
          'Example: `.explain quantum computing`\n' +
          'Example: `.explain why is the sky blue`'
        );
      }

      await extra.react('📚');

      const prompt = [
        'Explain the following topic in simple, easy-to-understand terms (ELI5 style).',
        'Avoid jargon, or explain any jargon you must use.',
        'Use a friendly tone with short paragraphs and bullet points where helpful.',
        '',
        '<topic>',
        topic,
        '</topic>',
      ].join('\n');

      const answer = await generateContent([{ text: prompt }], {
        temperature: 0.5,
        maxOutputTokens: 1200,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: `📚 *Explain: ${topic}*\n\n${answer}`,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[explain] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Explanation failed: ${error.message}`);
    }
  }
};
