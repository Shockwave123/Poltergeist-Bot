/**
 * Text-to-speech using Microsoft Edge's online neural voices.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { EdgeTTS } = require('node-edge-tts');

const MAX_CHARS = 4000;
const CHUNK_CHARS = 190;
const LANGS = new Set(['en', 'hi', 'id', 'es', 'fr', 'de', 'pt', 'ar', 'ja', 'ko']);
const VOICE_PRESETS = {
  aria: { name: 'Aria (US English, feminine)', voice: 'en-US-AriaNeural', locale: 'en-US', lang: 'en' },
  guy: { name: 'Guy (US English, masculine)', voice: 'en-US-GuyNeural', locale: 'en-US', lang: 'en' },
  jenny: { name: 'Jenny (US English, feminine)', voice: 'en-US-JennyNeural', locale: 'en-US', lang: 'en' },
  sonia: { name: 'Sonia (UK English, feminine)', voice: 'en-GB-SoniaNeural', locale: 'en-GB', lang: 'en' },
  swara: { name: 'Swara (Hindi, feminine)', voice: 'hi-IN-SwaraNeural', locale: 'hi-IN', lang: 'hi' },
  madhur: { name: 'Madhur (Hindi, masculine)', voice: 'hi-IN-MadhurNeural', locale: 'hi-IN', lang: 'hi' },
  gadis: { name: 'Gadis (Indonesian, feminine)', voice: 'id-ID-GadisNeural', locale: 'id-ID', lang: 'id' },
  elvira: { name: 'Elvira (Spanish, feminine)', voice: 'es-ES-ElviraNeural', locale: 'es-ES', lang: 'es' },
  denise: { name: 'Denise (French, feminine)', voice: 'fr-FR-DeniseNeural', locale: 'fr-FR', lang: 'fr' },
  katja: { name: 'Katja (German, feminine)', voice: 'de-DE-KatjaNeural', locale: 'de-DE', lang: 'de' },
  francisca: { name: 'Francisca (Brazilian Portuguese, feminine)', voice: 'pt-BR-FranciscaNeural', locale: 'pt-BR', lang: 'pt' },
  salma: { name: 'Salma (Arabic, feminine)', voice: 'ar-EG-SalmaNeural', locale: 'ar-EG', lang: 'ar' },
  nanami: { name: 'Nanami (Japanese, feminine)', voice: 'ja-JP-NanamiNeural', locale: 'ja-JP', lang: 'ja' },
  sunhi: { name: 'SunHi (Korean, feminine)', voice: 'ko-KR-SunHiNeural', locale: 'ko-KR', lang: 'ko' }
};

const DEFAULT_VOICE_BY_LANG = {
  en: 'aria',
  hi: 'swara',
  id: 'gadis',
  es: 'elvira',
  fr: 'denise',
  de: 'katja',
  pt: 'francisca',
  ar: 'salma',
  ja: 'nanami',
  ko: 'sunhi'
};

function prepareSpeechText(text) {
  return String(text)
    .replace(/https?:\/\/\S+/gi, ' link ')
    .replace(/[*_~`]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '')
    .replace(/[\r\n]+/g, '. ')
    .replace(/\s+/g, ' ')
    .replace(/([.!?])\1+/g, '$1')
    .trim()
    .slice(0, MAX_CHARS);
}

function detectLang(text) {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(text)) return 'ja';
  return 'en';
}

/**
 * Split prepared text into sentence-aware chunks of roughly CHUNK_CHARS.
 */
function chunkText(text, maxChars = CHUNK_CHARS) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf('. ', maxChars);
    if (cut === -1) cut = remaining.lastIndexOf(' ', maxChars);
    if (cut === -1 || cut === 0) cut = maxChars;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
} catch { /* use system ffmpeg */ }

/**
 * Merge multiple MP3 buffers into one using FFmpeg concat demuxer.
 * Returns a single MP3 buffer.
 */
async function mergeMp3(buffers) {
  if (buffers.length === 1) return buffers[0];

  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const inputFiles = [];
  const concatListPath = path.join(tempDir, 'tts_concat_' + Date.now() + '.txt');
  const outputPath = path.join(tempDir, 'tts_merged_' + Date.now() + '.mp3');
  const listLines = [];

  try {
    for (let i = 0; i < buffers.length; i += 1) {
      const inputPath = path.join(tempDir, 'tts_chunk_' + Date.now() + '_' + i + '.mp3');
      fs.writeFileSync(inputPath, buffers[i]);
      inputFiles.push(inputPath);
      listLines.push("file '" + inputPath.replace(/'/g, "\\'") + "'");
    }
    fs.writeFileSync(concatListPath, listLines.join('\n'));



    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        outputPath
      ]);
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error('ffmpeg concat failed (' + code + '): ' + stderr.slice(-500)));
        resolve();
      });
    });

    const merged = await fs.promises.readFile(outputPath);
    if (!merged.length) throw new Error('Merged audio is empty');
    return merged;
  } finally {
    for (const file of inputFiles) {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
    }
    try { fs.unlinkSync(concatListPath); } catch { /* ignore */ }
    try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
  }
}

function resolveVoice(voice, lang = 'en') {
  const requested = String(voice || '').trim().toLowerCase();
  if (requested) {
    const preset = VOICE_PRESETS[requested]
      || Object.values(VOICE_PRESETS).find((candidate) => candidate.voice.toLowerCase() === requested);
    if (!preset) throw new Error(`Unknown voice "${voice}". Use .tts voices to see options.`);
    return preset;
  }
  return VOICE_PRESETS[DEFAULT_VOICE_BY_LANG[lang] || 'aria'];
}

async function synthesizeEdge(text, preset) {
  const tts = new EdgeTTS({
    voice: preset.voice,
    lang: preset.locale,
    outputFormat: 'audio-24khz-96kbitrate-mono-mp3',
    timeout: 30000
  });
  const audioChunks = [];

  for await (const chunk of tts.streamAudio(text)) {
    if (Buffer.isBuffer(chunk)) audioChunks.push(chunk);
  }

  if (!audioChunks.length) throw new Error('The neural voice provider returned empty audio.');
  return Buffer.concat(audioChunks);
}

async function generateSpeech(text, lang, voice) {
  const trimmed = prepareSpeechText(text);
  if (!trimmed) throw new Error('No text provided');

  const preset = resolveVoice(voice, lang);
  return synthesizeEdge(trimmed, preset);
}

function parseTtsInput(args) {
  if (!args.length) return { text: '', lang: 'en' };

  const first = args[0].toLowerCase();
  if (VOICE_PRESETS[first]) {
    return { lang: VOICE_PRESETS[first].lang, voice: first, text: args.slice(1).join(' ').trim() };
  }
  if (LANGS.has(first) && args.length > 1) {
    return { lang: first, text: args.slice(1).join(' ').trim() };
  }

  const text = args.join(' ');
  return { text: text.trim(), lang: detectLang(text) };
}

module.exports = {
  generateSpeech,
  parseTtsInput,
  prepareSpeechText,
  detectLang,
  resolveVoice,
  VOICE_PRESETS,
  MAX_CHARS,
  CHUNK_CHARS,
  LANGS,
  chunkText,
  mergeMp3
};
