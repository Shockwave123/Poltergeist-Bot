/**
 * Email Command - Draft a professional email from a short brief
 * Usage: .email <what the email is about>
 * Example: .email ask my boss for a day off on Friday
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'email',
  aliases: ['writeemail'],
  category: 'ai',
  description: 'Draft a professional email from a short brief',
  usage: '.email <brief>\nExample: .email ask my boss for a day off on Friday',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const brief = args.join(' ').trim();

      if (!brief) {
        return extra.reply(
          '📧 *Email Writer*\n\n' +
          'Usage: `.email <what the email is about>`\n\n' +
          'Example: `.email follow up on the invoice I sent last week`\n' +
          'Example: `.email decline a job offer politely`'
        );
      }

      await extra.react('📧');

      const answer = await generateContent([{
        text: [
          'Draft a professional email based on this brief.',
          'Include a clear subject line, greeting, body and sign-off.',
          'Keep it concise (under 150 words). Return only the email.',
          '',
          '<brief>',
          brief,
          '</brief>',
        ].join('\n'),
      }], {
        temperature: 0.6,
        maxOutputTokens: 1000,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: '📧 *Draft Email*\n\n' + answer,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[email] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) return extra.reply(error.message);
      await extra.reply('❌ Email draft failed: ' + error.message);
    }
  }
};
