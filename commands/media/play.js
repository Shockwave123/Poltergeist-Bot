const path = require('node:path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { fetchPublicUrl } = require('../../utils/webContent');
const { buildPlatformSearchLink } = require('../../utils/platformSearch');
const mediaResolver = require('../../utils/mediaResolver');
const { toAudio } = require('../../utils/converter');

const MAX_AUDIO_BYTES = 45 * 1024 * 1024;
const MAX_FETCH_BYTES = 100 * 1024 * 1024;
const AUDIO_TYPES = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.oga': 'audio/ogg', '.webm': 'audio/webm'
};
const VIDEO_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.3gp': 'video/3gpp'
};

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


async function resolveStream(url, platform, query) {
  const platformLower = String(platform || '').toLowerCase();

  if (platformLower === 'soundcloud') {
    try {
      const stream = await mediaResolver.soundcloudStream(url || query);
      const response = await fetchPublicUrl(stream.url, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
      return { audio: response.buffer, mimeType: 'audio/mpeg', filename: `${stream.title || 'soundcloud'}.mp3`, source: stream.url };
    } catch (error) {
      // fall through to link fallback
    }
  }

  if (platformLower === 'spotify') {
    try {
      const result = await mediaResolver.spotifyResolve(url || query);
      if (!result?.url) throw new Error('No downloadable preview is available for that Spotify link.');
      const response = await fetchPublicUrl(result.url, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
      return { audio: response.buffer, mimeType: result.mimetype || 'audio/mp4', filename: result.filename || 'spotify.m4a', source: result.url };
    } catch (error) {
      // fall through
    }
  }

  if (platformLower === 'itunes' || platformLower === 'deezer') {
    try {
      const search = platformLower === 'itunes' ? mediaResolver.itunesSearch : mediaResolver.deezerSearch;
      const result = await search(query || url);
      const item = Array.isArray(result) ? result[0] : (result?.result || result?.data?.[0] || result?.tracks?.[0]);
      if (!item) throw new Error('No matching track found.');
      const preview = item.preview_url || item.preview || item.track_preview || item.url || null;
      if (!preview || !/^https?:/i.test(preview)) throw new Error('No preview is available for that track.');
      const response = await fetchPublicUrl(preview, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
      return { audio: response.buffer, mimeType: 'audio/mpeg', filename: `${item.name || item.title || 'preview'}.mp3`, source: preview };
    } catch (error) {
      // fall through
    }
  }

  if (platformLower === 'tiktok') {
    try {
      const result = await mediaResolver.tiktokDownload(url || query);
      const video = result?.videoUrl || result?.url || null;
      const audio = result?.audioUrl || result?.audio || null;
      if (audio) {
        const response = await fetchPublicUrl(audio, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
        return { audio: response.buffer, mimeType: 'audio/mpeg', filename: result.title || 'tiktok', source: audio };
      }
      if (video) {
        const response = await fetchPublicUrl(video, { maxBytes: MAX_FETCH_BYTES, accept: 'video/*,application/octet-stream' });
        // video-only result: keep the buffer, the execute step extracts the audio track
        return { audio: response.buffer, mimeType: response.contentType.split(';')[0].trim() || 'video/mp4', filename: (result.title || 'tiktok') + '.mp4', source: video };
      }
    } catch (error) {
      // fall through
    }
  }

  if (platformLower === 'youtube') {
    try {
      const result = await mediaResolver.youtubeAudio(url);
      const response = await fetchPublicUrl(result.url, {
        maxBytes: MAX_AUDIO_BYTES,
        accept: 'audio/*,application/octet-stream'
      });
      return {
        audio: response.buffer,
        mimeType: result.mimetype || 'audio/mpeg',
        filename: result.filename || 'youtube',
        source: result.source || url
      };
    } catch (error) {
      // fall through to link fallback
    }
  }

  if (platformLower === 'audiomack') {
    // Audiomack does not expose public stream URLs; nothing playable to resolve.
  }

  return null;
}

// Convert a downloaded video (or unknown container with a video extension)
// into WhatsApp-playable MP3 audio using the bundled ffmpeg.
async function toPlayableAudio(buffer, mimetype, filename) {
  const extension = path.extname(filename || '').toLowerCase();
  if (mimetype.startsWith('video/') || VIDEO_TYPES[extension]) {
    try {
      const mp3 = await toAudio(buffer, extension.replace('.', '') || 'mp4');
      return { audio: mp3, mimetype: 'audio/mpeg', filename: (path.basename(filename || 'audio', extension) || 'audio') + '.mp3' };
    } catch (error) {
      throw new Error(`could not extract the audio track from that file${error && error.message ? ` (${error.message})` : ''}`);
    }
  }
  throw new Error('That link did not return a playable audio or video file.');
}

module.exports = {
  name: 'play',
  aliases: ['playaudio'],
  category: 'media',
  description: 'Play audio: reply to an audio file, or give a media URL (YouTube, SoundCloud, Spotify, TikTok, Audiomack) — direct video links are converted to MP3.',
  usage: '.play (reply to audio) or .play <media url / direct audio or video link>',

  async execute(sock, msg, args, extra) {
    try {
      const current = unwrapMessage(msg.message);
      const quoted = current.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedKey = current.extendedTextMessage?.contextInfo;

      const quotedAudio = quoted ? unwrapMessage(quoted) : null;
      const quotedIsAudio = quotedAudio?.audioMessage ||
        (quotedAudio?.documentMessage && String(quotedAudio?.documentMessage?.mimetype || '').startsWith('audio/'));

      const directAudioMessage = current.audioMessage || (current.documentMessage && String(current.documentMessage.mimetype || '').startsWith('audio/'));

      let audio;
      let mimetype = 'audio/mpeg';
      let fileName = 'audio';

      if (directAudioMessage || quotedIsAudio) {
        const sourceMessage = directAudioMessage
          ? { key: msg.key, message: current }
          : { key: { remoteJid: extra.from, id: quotedKey?.stanzaId, participant: quotedKey?.participant }, message: quotedAudio };
        const buf = await downloadMediaMessage(sourceMessage, 'buffer', {}, {
          logger: undefined,
          reuploadRequest: sock.updateMediaMessage
        });
        audio = buf;
        mimetype = directAudioMessage?.mimetype || quotedIsAudio?.mimetype || 'audio/mpeg';
        fileName = directAudioMessage?.fileName || (quotedAudio?.documentMessage?.fileName || 'audio');
      } else if (args[0]) {
        const url = String(args[0]).trim();
        if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
          return extra.reply('Provide a full http(s) URL, or reply to an audio file you can share.');
        }
        const platform = mediaResolver.detectPlatform(url);
        const resolved = await resolveStream(url, platform, args.join(' ').trim());

        if (resolved && resolved.audio != null && resolved.audio.length > 0) {
          audio = resolved.audio;
          mimetype = resolved.mimeType || 'audio/mpeg';
          fileName = resolved.filename || path.basename(new URL(resolved.source || url).pathname) || 'audio';
        } else {
          // Direct file link: accept audio OR video URLs — video is converted to MP3 below.
          const response = await fetchPublicUrl(url, {
            maxBytes: MAX_FETCH_BYTES,
            accept: 'audio/*,video/*,application/octet-stream'
          });
          audio = response.buffer;
          const extension = path.extname(new URL(response.url).pathname).toLowerCase();
          mimetype = response.contentType.split(';')[0].trim() || 'application/octet-stream';
          if (mimetype === 'application/octet-stream') {
            mimetype = AUDIO_TYPES[extension] || VIDEO_TYPES[extension] || mimetype;
          }
          fileName = path.basename(new URL(response.url).pathname) || 'audio';
        }
      } else {
        return extra.reply('Reply to an audio file with `.play`, or use `.play <media URL>`.');
      }

      if (!Buffer.isBuffer(audio) || !audio.length) throw new Error('The audio file is empty or could not be downloaded.');

      // Direct video links (and video-only TikTok results) become MP3 audio.
      if (!mimetype.startsWith('audio/')) {
        const converted = await toPlayableAudio(audio, mimetype, fileName);
        audio = converted.audio;
        mimetype = converted.mimetype;
        fileName = converted.filename;
      }

      if (audio.length > MAX_AUDIO_BYTES) throw new Error('Audio must be 45 MB or smaller.');

      return sock.sendMessage(extra.from, { audio, mimetype, ptt: false, fileName }, { quoted: msg });
    } catch (error) {
      console.error('[play] failed:', error.message);
      return extra.reply(`Could not send that audio: ${error.message}`);
    }
  }
};