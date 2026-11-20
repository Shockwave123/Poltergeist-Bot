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
const PROVIDER_TIMEOUT_MS = Number(process.env.TRANSCRIPTION_PROVIDER_TIMEOUT_MS) || 45000;

async function splitAudio(buffer, filename, segmentSeconds = SEGMENT_SECONDS) {
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
        '-f', 'segment', '-segment_time', String(segmentSeconds),
        '-reset_timestamps', '1', '-segment_format', 'wav', outputPattern
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
    timeout: Number(process.env.TRANSCRIPTION_GEMINI_TIMEOUT_MS) || 60000,
    totalTimeout: Number(process.env.TRANSCRIPTION_GEMINI_TIMEOUT_MS) || 60000,
    apiKey: options.apiKey,
    senderId: options.senderId,
    providers: ['gemini']
  });
  return text.trim();
}

async function transcribeWithOpenAI(buffer, filename, mimeType) {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType: mimeType });
  form.append('model', TRANSCRIPTION_MODEL);
  const { data } = await axios.post(TRANSCRIPTION_URL, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    timeout: PROVIDER_TIMEOUT_MS,
    maxBodyLength: 25 * 1024 * 1024
  });
  const text = data?.text?.trim();
  if (!text) throw new Error('The transcription service returned an empty result.');
  return text;
}

function getApiKey(...names) {
  for (const name of names) {
    const key = String(process.env[name] || '').split(/[\s,;]+/).find(Boolean);
    if (key) return key.trim();
  }
  return '';
}

async function transcribeWithZai(buffer, filename) {
  const converted = await splitAudio(buffer, filename, 25);
  try {
    const transcripts = [];
    for (const file of converted.files) {
      const form = new FormData();
      form.append('file', await fs.readFile(file), {
        filename: path.basename(file),
        contentType: 'audio/wav'
      });
      form.append('model', process.env.ZAI_ASR_MODEL || 'glm-asr-2512');
      form.append('stream', 'false');
      const { data } = await axios.post(
        process.env.ZAI_ASR_URL || 'https://api.z.ai/api/paas/v4/audio/transcriptions',
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${getApiKey('ZAI_API_KEY', 'ZAI_API_KEYS', 'ZHIPUAI_API_KEY')}`
          },
          timeout: PROVIDER_TIMEOUT_MS,
          maxBodyLength: 25 * 1024 * 1024
        }
      );
      const text = data?.text?.trim();
      if (!text) throw new Error('Z.AI returned an empty transcript.');
      transcripts.push(text);
    }
    return transcripts.join('\n');
  } finally {
    await fs.rm(converted.directory, { recursive: true, force: true });
  }
}

function getTranscriptionProviders() {
  const priority = String(process.env.TRANSCRIPTION_PROVIDER_PRIORITY || 'zai,openai,gemini')
    .toLowerCase()
    .split(/[\s,;]+/);
  const providers = {
    zai: () => getApiKey('ZAI_API_KEY', 'ZAI_API_KEYS', 'ZHIPUAI_API_KEY'),
    openai: () => process.env.OPENAI_API_KEY,
    gemini: () => true
  };
  return [...new Set([...priority, 'zai', 'openai', 'gemini'])]
    .filter((provider) => providers[provider] && providers[provider]());
}

async function transcribePart(buffer, filename, mimeType, options) {
  const failures = [];
  for (const provider of getTranscriptionProviders()) {
    try {
      if (provider === 'zai') return await transcribeWithZai(buffer, filename);
      if (provider === 'openai') return await transcribeWithOpenAI(buffer, filename, mimeType);
      return await transcribeWithGemini(buffer, mimeType, options);
    } catch (error) {
      failures.push(`${provider}: ${error.message}`);
    }
  }
  throw new Error(`All configured transcription providers failed.\n${failures.map((failure) => `• ${failure}`).join('\n')}`);
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
      const transcript = await transcribePart(partBuffer, part.filename, part.mimetype, options);
      if (transcript) transcripts.push(transcript);
    }
    if (!transcripts.length) throw new Error('The transcription service returned an empty result.');
    return transcripts.join('\n');
  } finally {
    if (segments.directory) await fs.rm(segments.directory, { recursive: true, force: true });
  }
}

module.exports = { transcribeAudio, splitAudio };
