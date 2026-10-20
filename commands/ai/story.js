/**
 * Story Command - Generate a short story
 * Usage: .story <prompt>
 * Example: .story a robot who learns to paint
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'story',
  aliases: ['shortstory'],
  category: 'ai',
  description: 'Generate a short story from a prompt',
  usage: '.story <prompt>\nExample: .story a time traveler visits ancient Egypt',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const prompt = args.join(' ').trim();

      if (!prompt) {
        return extra.reply(
          '📖 *Short Story Generator*\n\n' +
          'Usage: `.story <prompt>`\n' +
          'Example: `.story a dragon who opens a bakery`'
        );
      }

      await extra.react('📖');

      const fullPrompt = [
        `Write a short, engaging story based on this prompt: "${prompt}"`,
        'Include a beginning, middle, and end. Keep it under 400 words.',
        'Make it creative and entertaining.',
      ].join(' ');

      const story = await generateContent([{ text: fullPrompt }], {
        temperature: 0.8,
        maxOutputTokens: 1000,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: `📖 *Story*\n\n${story.trim()}`,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[story] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Story generation failed: ${error.message}`);
    }
  }
};
