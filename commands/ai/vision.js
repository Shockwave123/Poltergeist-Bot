/**
 * Vision Command - Multimodal image analysis using Gemini (native multi-modal support).
 *
 * Usage:
 *   Direct:  .vision <prompt> (attach an image)
 *   Quoted:  reply to an image with .vision <prompt>
 *   Tagged:  @bot .vision <prompt> (with an image attached)
 *
 * Optimized for Render free instance: short timeouts, small token limits,
 * automatic failover between Gemini and OpenRouter vision models.
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

module.exports = {
  name: 'vision',
  aliases: ['img', 'analyzeimg', 'see'],
  category: 'ai',
  description: 'Analyze an image with AI (bug fixes, math problems, receipts, memes, charts, etc.)',
  usage: '.vision <prompt> (attach or reply to an image)',

  async execute(sock, msg, args, extra) {
    try {
      const current = unwrapMessage(msg.message);
      const contextInfo = current.extendedTextMessage?.contextInfo
        || current.buttonsResponseMessage?.contextInfo
        || current.listResponseMessage?.contextInfo;
      const quotedMessage = unwrapMessage(contextInfo?.quotedMessage);

      // Direct image attachment OR quoted image
      const directImage = current.imageMessage;
      const quotedImage = quotedMessage?.imageMessage;
      const selectedMessage = directImage ? current : quotedMessage;
      const imageMessage = directImage || quotedImage;

      if (!imageMessage) {
        return extra.reply(
          '📷 *Vision - Image Analysis*\n\n' +
          'Attach an image or reply to one with a prompt.\n\n' +
          `Usage: ${extra.prefix || '.'}vision <your prompt>\n` +
          'Example: Reply to a code screenshot with:\n' +
          `${extra.prefix || '.'}vision explain this bug and how to fix it`
        );
      }

      const prompt = args.join(' ').trim() ||
        'Analyze this image in detail. Describe what you see, extract any text, and answer the user\'s question. Be structured and useful.';

      const targetMessage = directImage
        ? { key: msg.key, message: current }
        : {
          key: {
            remoteJid: extra.from,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant,
          },
          message: selectedMessage,
        };

      await extra.react('👁️');
      const buffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage },
      );

      if (!buffer?.length) {
        throw new Error('The image could not be downloaded.');
      }

      const mimeType = imageMessage.mimetype || 'image/jpeg';

      const parts = [
        { text: prompt },
        { inlineData: { mimeType, data: buffer.toString('base64') } },
      ];

      // Render free instance: keep tokens small, timeout short
      const answer = await generateContent(parts, {
        temperature: 0.3,
        maxOutputTokens: 1200,
        timeout: 85000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await extra.reply(answer);
      await extra.react('✅');
    } catch (error) {
      console.error('[vision] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Could not analyze that image.\n\n${error.message}`);
    }
  },
};
