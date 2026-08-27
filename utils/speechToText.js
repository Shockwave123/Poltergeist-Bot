/**
 * Speech-to-text using an OpenAI-compatible transcription API.
 */

const axios = require('axios');
const FormData = require('form-data');
const { generateContent } = require('./googleAi');

const TRANSCRIPTION_URL = process.env.TRANSCRIPTION_URL || 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';

async function transcribeAudio(audioBuffer, filename = 'voice.ogg', mimetype = 'audio/ogg', options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const text = await generateContent([
      { text: 'Transcribe this voice note exactly. Return only the spoken words, without labels, commentary, or quotation marks.' },
      { inlineData: { mimeType: mimetype, data: audioBuffer.toString('base64') } },
    ], { maxOutputTokens: 500, timeout: 120000, apiKey: options.apiKey });
    return text.trim();
  }

  const form = new FormData();
  form.append('file', audioBuffer, { filename, contentType: mimetype });
  form.append('model', TRANSCRIPTION_MODEL);

  const { data } = await axios.post(TRANSCRIPTION_URL, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 120000,
    maxBodyLength: 25 * 1024 * 1024,
  });

  const text = data?.text?.trim();
  if (!text) throw new Error('The transcription service returned no text.');
  return text;
}

module.exports = { transcribeAudio };
