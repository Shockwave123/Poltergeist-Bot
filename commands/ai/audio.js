/**
 * Audio Command - Transcribe a voice note and summarize it with AI.
 *
 * Usage:
 *   .audio <optional instructions>  (attach/reply to audio)
 *
 * Pipeline: speechToText (Gemini-native audio transcription) -> generateContent
 * for the summary. Both APIs failover automatically (Gemini + OpenRouter keys).
 *
 * Render free tier: sequential calls only, short token limits, hard timeout.
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { transcribeAudio } = require('../../utils/speechToText');
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
  name: 'audio',
  aliases: ['summarizeaudio', 'audiosum', 'voiceai'],
  category: 'ai',
  description: 'Transcribe a voice note and get an AI summary of it',
  usage: '.audio (attach/reply to audio)  |  .audio <instructions>',

  async execute(sock, msg, args, extra) {
    try {
      const current = unwrapMessage(msg.message);
      const contextInfo = current.extendedTextMessage?.contextInfo
        || current.buttonsResponseMessage?.contextInfo
        || current.listResponseMessage?.contextInfo;
      const quotedMessage = unwrapMessage(contextInfo?.quotedMessage);

      const currentAudio = current.audioMessage ||
        (current.documentMessage?.mimetype?.startsWith('audio/') ? current.documentMessage : null);
      const quotedAudio = quotedMessage.audioMessage ||
        (quotedMessage.documentMessage?.mimetype?.startsWith('audio/') ? quotedMessage.documentMessage : null);
      const audioMessage = currentAudio || quotedAudio;

      if (!audioMessage) {
        return extra.reply(
          '🎧 *Audio Summarizer*\n\n' +
          'Attach or reply to a voice note and I will transcribe and summarize it.\n\n' +
          `Usage: ${extra.prefix || '.'}audio [optional instructions]\n` +
          'Example: Reply to a voice note with: .audio list the action items'
        );
      }

      const instructions = args.join(' ').trim();
      const targetMessage = currentAudio
        ? { key: msg.key, message: current }
        : {
          key: {
            remoteJid: extra.from,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant,
          },
          message: quotedMessage,
        };

      await extra.react('🎧');
      const audioBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage },
      );

      if (!audioBuffer?.length) throw new Error('The audio could not be downloaded.');

      // Step 1: transcribe (sequential - keeps Render free instance load minimal)
      const transcript = await transcribeAudio(
        audioBuffer,
        audioMessage.fileName || 'voice.ogg',
        audioMessage.mimetype || (audioMessage.ptt ? 'audio/ogg' : 'audio/mpeg'),
        { apiKey: getKey(extra.sender), senderId: extra.sender },
      );

      if (!transcript?.trim()) throw new Error('Transcription came back empty.');

      // Step 2: summarize
      const prompt = [
        'Summarize this voice note transcript for a WhatsApp chat.',
        instructions
          ? `User instructions: ${instructions}`
          : 'Give a short summary with key points as bullets. Mention action items if any.',
        'Keep it under 200 words. If the transcript is unclear in places, note that briefly.',
        '',
        '<transcript>',
        transcript.slice(0, 6000),
        '</transcript>',
      ].join('\n');

      const summary = await generateContent([{ text: prompt }], {
        temperature: 0.3,
        maxOutputTokens: 600,
        timeout: 60000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      await extra.reply(`🎧 *Audio Summary*\n\n${summary}\n\n__Transcript (${transcript.length} chars) available via .transcribe__`);
      await extra.react('✅');
    } catch (error) {
      console.error('[audio] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Could not process that audio.\n\n${error.message}`);
    }
  },
};
