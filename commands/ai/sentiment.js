/**
 * Sentiment Command - Analyze the sentiment/emotion of text
 * Usage: .sentiment <text>
 * Example: .sentiment I absolutely loved the movie, best of the year!
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'sentiment',
  aliases: ['emotion', 'moodcheck'],
  category: 'ai',
  description: 'Analyze sentiment and emotion of any text',
  usage: '.sentiment <text>\nExample: .sentiment I aced my exams, so happy!',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const text = args.join(' ').trim();

      if (!text) {
        return extra.reply(
          '🎭 *Sentiment Analysis*\n\n' +
          'Usage: `.sentiment <text>`\n\n' +
          'Example: `.sentiment I aced my exams, so happy!`'
        );
      }

      await extra.react('🎭');

      const answer = await generateContent([{
        text: [
          'Analyze the sentiment of the text below. Reply with exactly:',
          'Sentiment: positive / negative / neutral (+ confidence %)',
          'Emotion: primary emotion (joy, anger, sadness, fear, surprise, trust...)',
          'Reason: one short sentence explaining why.',
          '',
          '<text>',
          text,
          '</text>',
        ].join('\n'),
      }], {
        temperature: 0.2,
        maxOutputTokens: 400,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: '🎭 *Sentiment Analysis*\n\n' + answer,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[sentiment] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) return extra.reply(error.message);
      await extra.reply('❌ Sentiment analysis failed: ' + error.message);
    }
  }
};
