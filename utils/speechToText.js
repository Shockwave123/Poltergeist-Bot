/**
 * Speech-to-text using an OpenAI-compatible transcription API.
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { generateContent } = require('./googleAi');
const ffmpegPath = require('ffmpeg-static');

const TRANSCRIPTION_URL = process.env.TRANSCRIPTION_URL || 'https://api.openai.com/v1/audio/transcriptions';
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const SEGMENT_AFTER_BYTES = 1024 * 1024;
const SEGMENT_SECONDS = 180;

async function splitAudio(buffer, filename) {
  if (!ffmpegPath) throw new Error('FFmpeg is unavailable for splitting this long recording.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'poltergeist-transcription-'));
  const extension = path.extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.audio';
  const inputPath = path.join(directory, `input${extension}`);
  const outputPattern = path.join(directory, 'part-%03d.wav');
  try {
    await fs.writeFile(inputPath, buffer);
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath,
        '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
        '-f', 'segment', '-segment_time', String(SEGMENT_SECONDS),
        '-reset_timestamps', '1', outputPattern
      ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        if (stderr.length < 4000) stderr += chunk.toString();
      });
      child.once('error', reject);
      child.once('close', (code) => code === 0
        ? resolve()
        : reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`)));
    });
    const files = (await fs.readdir(directory))
      .filter((name) => /^part-\d+\.wav$/i.test(name))
      .sort()
      .map((name) => path.join(directory, name));
    if (!files.length) throw new Error('FFmpeg did not produce any audio segments.');
    return { directory, files };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw new Error(`Could not split the long recording: ${error.message}`);
  }
}

async function transcribeWithGemini(buffer, mimeType, options) {
  const text = await generateContent([
    { text: 'Transcribe every spoken word in this audio in its original language. Preserve the complete recording from beginning to end, including repeated words and speaker changes. Do not summarize, translate, or omit unclear sections; mark an unclear word as [unclear]. Return only the transcript.' },
    { inlineData: { mimeType, data: buffer.toString('base64') } }
  ], {
    maxOutputTokens: Math.min(8192, Math.max(1000, Number(process.env.TRANSCRIPTION_MAX_OUTPUT_TOKENS) || 8192)),
    timeout: 180000,
    apiKey: options.apiKey,
    senderId: options.senderId
  });
  return text.trim();
}

async function transcribeWithOpenAI(buffer, filename, mimeType) {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType: mimeType });
  form.append('model', TRANSCRIPTION_MODEL);
  const { data } = await axios.post(TRANSCRIPTION_URL, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    timeout: 180000,
    maxBodyLength: 25 * 1024 * 1024
  });
  const text = data?.text?.trim();
  if (!text) throw new Error('The transcription service returned an empty result.');
  return text;
}

async function transcribeAudio(audioBuffer, filename = 'voice.ogg', mimetype = 'audio/ogg', options = {}) {
  if (!Buffer.isBuffer(audioBuffer) || !audioBuffer.length) throw new Error('The audio file is empty.');
  if (audioBuffer.length > MAX_AUDIO_BYTES) throw new Error('Audio must be 50 MB or smaller.');

  const segments = audioBuffer.length > SEGMENT_AFTER_BYTES
    ? await splitAudio(audioBuffer, filename)
    : { directory: null, files: [] };
  const inputs = segments.files.length
    ? segments.files.map((file, index) => ({ file, filename: `transcript-part-${index + 1}.wav`, mimetype: 'audio/wav' }))
    : [{ buffer: audioBuffer, filename, mimetype }];

  try {
    const transcripts = [];
    for (const part of inputs) {
      const partBuffer = part.buffer || await fs.readFile(part.file);
      const transcript = process.env.OPENAI_API_KEY
        ? await transcribeWithOpenAI(partBuffer, part.filename, part.mimetype)
        : await transcribeWithGemini(partBuffer, part.mimetype, options);
      if (transcript) transcripts.push(transcript);
    }
    if (!transcripts.length) throw new Error('The transcription service returned an empty result.');
    return transcripts.join('\n');
  } finally {
    if (segments.directory) await fs.rm(segments.directory, { recursive: true, force: true });
  }
}

module.exports = { transcribeAudio, splitAudio };
