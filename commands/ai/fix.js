/**
 * Fix Command - Debug and repair code from text, quoted messages, or screenshots.
 *
 * Usage:
 *   .fix <error or description> (attach/quote code or a screenshot)
 *   .code <same as .fix>
 *
 * Sources accepted (in priority order):
 *   1. Direct/quoted image (code screenshot) -> multimodal Gemini vision
 *   2. Quoted text message (code or error log)
 *   3. Code pasted in the command args
 *
 * Render free tier: single API call, short token limits, auto provider failover.
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
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

const FIX_SYSTEM_RULES = [
  'You are an expert debugger and code reviewer.',
  'Analyze the supplied code/screenshot and the user description.',
  'Respond with:',
  '1. *Problem* - what is wrong (1-3 bullet points)',
  '2. *Fix* - corrected code inside a code block',
  '3. *Why* - one short sentence explaining the root cause',
  'Keep the whole reply under 500 words. If no code is visible, ask the user to paste it.',
].join('\n');

module.exports = {
  name: 'fix',
  aliases: ['code', 'debug', 'fixbug'],
  category: 'ai',
  description: 'Debug and fix code from text, a quoted message, or a code screenshot',
  usage: '.fix <error/description> (attach or quote code)  |  .code <same>',

  async execute(sock, msg, args, extra) {
    try {
      const current = unwrapMessage(msg.message);
      const contextInfo = current.extendedTextMessage?.contextInfo
        || current.buttonsResponseMessage?.contextInfo
        || current.listResponseMessage?.contextInfo;
      const quotedMessage = unwrapMessage(contextInfo?.quotedMessage);

      const directImage = current.imageMessage;
      const quotedImage = quotedMessage?.imageMessage;
      const imageMessage = directImage || quotedImage;
      const quotedText = quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text || '';
      const directText = current.extendedTextMessage?.text || current.conversation || '';
      const requestText = args.join(' ').trim() || (directText ? directText.replace(/^\.?\S+\s*/, '') : '');

      if (!imageMessage && !quotedText && !requestText) {
        return extra.reply(
          '🛠️ *Code Fix*\n\n' +
          'Send me broken code and I will fix it.\n\n' +
          `Usage:\n• ${extra.prefix || '.'}fix <paste code or error>\n` +
          `• Reply to a code message with ${extra.prefix || '.'}fix\n` +
          `• Reply to a code screenshot with ${extra.prefix || '.'}fix\n\n` +
          'Alias: .code works the same way.'
        );
      }

      await extra.react('🛠️');
      let parts;

      if (imageMessage) {
        // Multimodal path: read code from screenshot
        const targetMessage = directImage
          ? { key: msg.key, message: current }
          : {
            key: {
              remoteJid: extra.from,
              id: contextInfo.stanzaId,
              participant: contextInfo.participant,
            },
            message: quotedMessage,
          };
        const buffer = await downloadMediaMessage(
          targetMessage,
          'buffer',
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage },
        );
        if (!buffer?.length) throw new Error('The screenshot could not be downloaded.');

        parts = [
          {
            text: [
              FIX_SYSTEM_RULES,
              '',
              `User request: ${requestText || 'fix any bugs visible in this screenshot'}`,
              quotedText ? `Quoted context:\n${quotedText.slice(0, 2000)}` : '',
            ].filter(Boolean).join('\n'),
          },
          { inlineData: { mimeType: imageMessage.mimetype || 'image/jpeg', data: buffer.toString('base64') } },
        ];
      } else {
        const codeSource = quotedText || requestText;
        parts = [{
          text: [
            FIX_SYSTEM_RULES,
            '',
            `User request: ${requestText || 'fix the code below'}`,
            '<code>',
            codeSource.slice(0, 8000),
            '</code>',
          ].join('\n'),
        }];
      }

      const answer = await generateContent(parts, {
        temperature: 0.2,
        maxOutputTokens: 1200,
        timeout: 85000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await extra.reply(answer);
      await extra.react('✅');
    } catch (error) {
      console.error('[fix] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Could not fix that code.\n\n${error.message}`);
    }
  },
};
