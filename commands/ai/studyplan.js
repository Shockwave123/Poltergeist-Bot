/**
 * Studyplan Command - Generate a day-by-day study plan
 * Usage: .studyplan <subject> [days] or .studyplan <subject> by <date>
 * Example: .studyplan math 7
 * Example: .studyplan chemistry by 2026-11-01
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'studyplan',
  aliases: ['studyplanner'],
  category: 'ai',
  description: 'Generate a day-by-day study plan for any subject',
  usage: '.studyplan <subject> [days|by <date>]\nExample: .studyplan math 7',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const input = args.join(' ').trim();

      if (!input) {
        return extra.reply(
          '📅 *Study Planner*\n\n' +
          'Usage: `.studyplan <subject> [days]`\n' +
          '       `.studyplan <subject> by <YYYY-MM-DD>`\n\n' +
          'Examples:\n' +
          '• `.studyplan math 7`\n' +
          '• `.studyplan chemistry by 2026-11-01`'
        );
      }

      await extra.react('📅');

      const answer = await generateContent([{
        text: [
          'Create a realistic study plan for the request below.',
          'Format: a numbered day-by-day list with subject/topics per day,',
          'breaks, revision days and a final review day. Keep each line short.',
          'If no duration is given, assume 7 days.',
          '',
          '<request>',
          input,
          '</request>',
        ].join('\n'),
      }], {
        temperature: 0.5,
        maxOutputTokens: 1200,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: '📅 *Study Plan: ' + input + '*\n\n' + answer,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[studyplan] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) return extra.reply(error.message);
      await extra.reply('❌ Study plan failed: ' + error.message);
    }
  }
};
