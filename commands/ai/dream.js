/**
 * Dream Command - Dream interpretation
 * Usage: .dream <dream description>
 * Example: .dream I was flying over a city
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'dream',
  aliases: ['dreaminterpret'],
  category: 'ai',
  description: 'Interpret the meaning of a dream',
  usage: '.dream <dream description>\nExample: .dream I was falling from a tall building',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const dream = args.join(' ').trim();

      if (!dream) {
        return extra.reply(
          '💭 *Dream Interpretation*\n\n' +
          'Usage: `.dream <description>`\n' +
          'Example: `.dream I was flying over a city`\n' +
          'Example: `.dream I lost my teeth`'
        );
      }

      await extra.react('💭');

      const prompt = [
        'Interpret the following dream. Provide possible meanings and symbolism.',
        'Mention that dream interpretation is subjective and not scientific.',
        'Keep it insightful but not alarming.',
        '',
        '<dream>',
        dream,
        '</dream>',
      ].join('\n');

      const interpretation = await generateContent([{ text: prompt }], {
        temperature: 0.7,
        maxOutputTokens: 800,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: `💭 *Dream Interpretation*\n\n${interpretation.trim()}\n\n_*Note:* Dream meanings are subjective and for entertainment purposes._`,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[dream] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Dream interpretation failed: ${error.message}`);
    }
  }
};
