/**
 * Tweet Command - Generate tweet/X post ideas for a topic
 * Usage: .tweet <topic>
 * Example: .tweet learning to code at 30
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'tweet',
  aliases: ['tweets'],
  category: 'ai',
  description: 'Generate tweet/X post ideas with hashtags',
  usage: '.tweet <topic>\nExample: .tweet remote work tips',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const topic = args.join(' ').trim();

      if (!topic) {
        return extra.reply(
          '🐦 *Tweet Generator*\n\n' +
          'Usage: `.tweet <topic>`\n\n' +
          'Example: `.tweet remote work tips`'
        );
      }

      await extra.react('🐦');

      const answer = await generateContent([{
        text: [
          'Write 3 different tweet/X posts about the topic below.',
          'Mix styles: one punchy/hot-take, one informative, one engaging question.',
          'Each must fit in 280 characters. Add 1-2 relevant hashtags per tweet.',
          'Number them 1., 2., 3.',
          '',
          '<topic>',
          topic,
          '</topic>',
        ].join('\n'),
      }], {
        temperature: 0.8,
        maxOutputTokens: 800,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: '🐦 *Tweet Ideas: ' + topic + '*\n\n' + answer,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[tweet] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) return extra.reply(error.message);
      await extra.reply('❌ Tweet generation failed: ' + error.message);
    }
  }
};
