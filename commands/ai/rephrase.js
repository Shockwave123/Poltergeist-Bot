/**
 * Rephrase Command - Rewrite text in a different tone/style
 * Usage: .rephrase <tone> <text>
 * Tones: formal, casual, friendly, professional, simple, short, poetic
 * Example: .rephrase formal Please come to the meeting tomorrow
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

const TONES = ['formal', 'casual', 'friendly', 'professional', 'simple', 'short', 'poetic'];

module.exports = {
  name: 'rephrase',
  aliases: ['rewrite'],
  category: 'ai',
  description: 'Rewrite text in a different tone (formal, casual, friendly...)',
  usage: '.rephrase <tone> <text>\nTones: ' + TONES.join(', ') + '\nExample: .rephrase formal I am running late',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const tone = (args[0] || '').toLowerCase();
      const text = args.slice(1).join(' ').trim();

      if (!text || !TONES.includes(tone)) {
        return extra.reply(
          '✍️ *Rephrase*\n\n' +
          'Usage: `.rephrase <tone> <text>`\n' +
          'Tones: ' + TONES.join(', ') + '\n\n' +
          'Example: `.rephrase formal I am running late`'
        );
      }

      await extra.react('✍️');

      const answer = await generateContent([{
        text: [
          'Rewrite the following text in a ' + tone + ' tone.',
          'Keep the same meaning, do not add or remove information.',
          'Return only the rewritten text.',
          '',
          '<text>',
          text,
          '</text>',
        ].join('\n'),
      }], {
        temperature: 0.6,
        maxOutputTokens: 1000,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: '✍️ *Rephrased (' + tone + ')*\n\n' + answer,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[rephrase] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) return extra.reply(error.message);
      await extra.reply('❌ Rephrase failed: ' + error.message);
    }
  }
};
