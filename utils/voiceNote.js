/**
 * Send clean WhatsApp voice notes from text.
 */

const { generateSpeech, detectLang } = require('./tts');
const { toPTT } = require('./converter');

async function sendVoiceNote(sock, chatId, text, quoted) {
  const speech = await generateSpeech(text, detectLang(text));
  const audio = await toPTT(speech, 'mp3');

  await sock.sendMessage(chatId, {
    audio,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true,
  }, { quoted });
}

module.exports = { sendVoiceNote };
