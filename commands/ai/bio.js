/**
 * Bio Command - Generate social media bios
 * Usage: .bio <vibe or profile description>
 * Example: .bio gym lover, coder, coffee addict
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'bio',
  aliases: ['biogen'],
  category: 'ai',
  description: 'Generate catchy social media bios for you',
  usage: '.bio <about you>\nExample: .bio gym lover, coder, coffee addict',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const about = args.join(' ').trim();

      if (!about) {
        return extra.reply(
          '🪪 *Bio Generator*\n\n' +
          'Usage: `.bio <about you>`\n\n' +
          'Example: `.bio gym lover, coder, coffee addict`\n' +
          'Returns 5 short bios you can pick from.'
        );
      }

      await extra.react('🪪');

      const answer = await generateContent([{
        text: [
          'Write 5 short social media bios based on this description.',
          'Vary the styles: funny, minimal, aesthetic, professional, emoji-heavy.',
          'Each must be under 120 characters. Number them 1. to 5.',
          '',
          '<description>',
          about,
          '</description>',
        ].join('\n'),
      }], {
        temperature: 0.9,
        maxOutputTokens: 600,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: '🪪 *Bio Ideas*\n\n' + answer,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[bio] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) return extra.reply(error.message);
      await extra.reply('❌ Bio generation failed: ' + error.message);
    }
  }
};
