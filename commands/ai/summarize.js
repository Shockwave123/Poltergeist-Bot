/**
 * Summarize Command - Summarize long text or articles
 * Usage: .summarize <text> | reply to a long message with .summarize
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

function unwrapMessage(message) {
  let content = message || {};
  for (let depth = 0; depth < 5; depth += 1) {
    const inner = content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.documentWithCaptionMessage?.message;
    if (!inner) break;
    content = inner;
  }
  return content;
}

function getTextFromMessage(msg) {
  const current = unwrapMessage(msg.message);
  const contextInfo = current.extendedTextMessage?.contextInfo
    || current.buttonsResponseMessage?.contextInfo
    || current.listResponseMessage?.contextInfo;
  const quoted = unwrapMessage(contextInfo?.quotedMessage);
  return quoted?.conversation || quoted?.extendedTextMessage?.text || '';
}

module.exports = {
  name: 'summarize',
  aliases: ['summary', 'summ'],
  category: 'ai',
  description: 'Summarize long text or articles',
  usage: '.summarize <text>\nReply to a long message with `.summarize`',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      let text = args.join(' ').trim();

      if (!text) {
        text = getTextFromMessage(msg);
      }

      if (!text) {
        return extra.reply(
          '📝 *Text Summarizer*\n\n' +
          'Usage: `.summarize <long text>`\n' +
          'Or reply to a long message with `.summarize`'
        );
      }

      await extra.react('📝');

      const prompt = [
        'Summarize the following text into key points.',
        'Keep it concise but capture all important information.',
        'Use bullet points for readability.',
        '',
        '<text>',
        text.slice(0, 8000),
        '</text>',
      ].join('\n');

      const answer = await generateContent([{ text: prompt }], {
        temperature: 0.3,
        maxOutputTokens: 1000,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await sock.sendMessage(chatId, {
        text: `📝 *Summary*\n\n${answer}`,
      }, { quoted: msg });

      await extra.react('✅');
    } catch (error) {
      console.error('[summarize] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Summarization failed: ${error.message}`);
    }
  }
};
