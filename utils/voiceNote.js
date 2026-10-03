/**
 * Send clean WhatsApp voice notes from text.
 */

const { generateSpeech, detectLang } = require('./tts');
const { toPTT } = require('./converter');

async function sendVoiceNote(sock, chatId, text, quoted, language = '') {
  const lang = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(language) ? language : detectLang(text);
  const speech = await generateSpeech(text, lang);
  const audio = await toPTT(speech, 'mp3');

  await sock.sendMessage(chatId, {
    audio,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true,
  }, { quoted });
}

module.exports = { sendVoiceNote };
