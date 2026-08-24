/**
 * Speech-to-text using an OpenAI-compatible transcription API.
 */

const axios = require('axios');
const FormData = require('form-data');

const TRANSCRIPTION_URL = process.env.TRANSCRIPTION_URL || 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';

async function transcribeAudio(audioBuffer, filename = 'voice.ogg', mimetype = 'audio/ogg') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Speech-to-text is not configured. Add OPENAI_API_KEY to the bot environment.');
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
