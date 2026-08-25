/**
 * Read a quoted image or PDF with Gemini Vision.
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

module.exports = {
  name: 'deepread',
  aliases: ['read', 'analyze', 'documentread'],
  category: 'ai',
  description: 'Read and explain a quoted image or PDF',
  usage: '.deepread [question] (reply to image or PDF)',

  async execute(sock, msg, args, extra) {
    try {
      const context = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = context?.quotedMessage;
      const media = quoted?.imageMessage || quoted?.documentMessage;
      if (!media || (quoted.documentMessage && !/^application\/pdf$/i.test(media.mimetype || ''))) {
        return extra.reply('Reply to an image or PDF with `.deepread [question]`.');
      }
      const target = { key: { remoteJid: extra.from, id: context.stanzaId, participant: context.participant }, message: quoted };
      const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
      if (!buffer?.length) throw new Error('The file could not be downloaded.');
      const mimeType = media.mimetype || (quoted.imageMessage ? 'image/jpeg' : 'application/pdf');
      const question = args.join(' ').trim() || 'Describe this clearly and extract the important information.';
      const answer = await generateContent([
        { text: `Analyze this document or image. Answer the user's question accurately. If text is unclear, say so. Keep the answer useful and structured. User question: ${question}` },
        { inlineData: { mimeType, data: buffer.toString('base64') } },
      ], { temperature: 0.2, maxOutputTokens: 900, timeout: 120000, apiKey: getKey(extra.sender) });
      await extra.reply(answer);
    } catch (error) {
      console.error('[deepread] error:', error);
      await extra.reply(`❌ Could not read that file.\n\n${error.message}`);
    }
  },
};
