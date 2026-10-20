/**
 * Text-to-Speech via Google Translate TTS (no API key required)
 *
 * Supports long-text chunking: splits input into ~190-character chunks,
 * synthesizes each chunk, then merges the MP3s with FFmpeg into a single
 * audio buffer.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MAX_CHARS = 4000;
const CHUNK_CHARS = 190;
const LANGS = new Set(['en', 'hi', 'id', 'es', 'fr', 'de', 'pt', 'ar', 'ja', 'ko']);

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

async function generateSpeech(text, lang) {
  const trimmed = prepareSpeechText(text);
  if (!trimmed) throw new Error('No text provided');

  const chunks = chunkText(trimmed, CHUNK_CHARS);
  const buffers = [];
  for (const chunk of chunks) {
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + lang + '&ttsspeed=0.9&q=' + encodeURIComponent(chunk);
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const buffer = Buffer.from(response.data);
    if (!buffer.length) throw new Error('Empty audio response');
    buffers.push(buffer);
  }

  return mergeMp3(buffers);
}

function parseTtsInput(args) {
  if (!args.length) return { text: '', lang: 'en' };

  const first = args[0].toLowerCase();
  if (LANGS.has(first) && args.length > 1) {
    return { lang: first, text: args.slice(1).join(' ').trim() };
  }

  const text = args.join(' ');
  return { text: text.trim(), lang: detectLang(text) };
}

module.exports = { generateSpeech, parseTtsInput, prepareSpeechText, detectLang, MAX_CHARS, CHUNK_CHARS, LANGS, chunkText, mergeMp3 };
