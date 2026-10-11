const path = require('node:path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { fetchPublicUrl } = require('../../utils/webContent');
const mediaResolver = require('../../utils/mediaResolver');

const MAX_FILE_BYTES = 45 * 1024 * 1024;
const MAX_AUDIO_BYTES = 45 * 1024 * 1024;
const AUDIO_TYPES = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'
};

function getFilename(url, contentDisposition) {
  const header = String(contentDisposition || '');
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = header.match(/filename="?([^";]+)"?/i)?.[1];
  let filename = encoded ? decodeURIComponent(encoded) : quoted;
  if (!filename) filename = path.basename(new URL(url).pathname) || 'download';
  filename = path.basename(filename).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return filename.slice(0, 120) || 'download';
}

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
      const result = await mediaResolver.soundcloudSearch(url || query);
      const track = result?.tracks?.[0] || result?.data?.[0];
      if (track) {
        const provider = track.hasOwnProperty('url') ? track.url
          : track.hasOwnProperty('stream_url') ? track.stream_url
          : track.hasOwnProperty('preview_url') ? track.preview_url
          : null;
        if (provider) {
          const response = await fetchPublicUrl(provider, { maxBytes: MAX_FILE_BYTES, accept: 'audio/*,application/octet-stream' });
          return { audio: response.buffer, mimeType: response.contentType.split(';')[0].trim() || 'audio/mpeg', filename: track.title || track.artist || 'soundcloud', source: provider };
        }
      }
    } catch (error) {
      // fall through to link fallback
    }
  }

  if (platformLower === 'spotify') {
    try {
      const result = await mediaResolver.spotifyResolve(url || query);
      const item = result?.item;
      if (item) {
        const tracks = Array.isArray(item) ? item : [item];
        for (const track of tracks) {
          if (track.preview_url) {
            const response = await fetchPublicUrl(track.preview_url, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
            return { audio: response.buffer, mimeType: 'audio/mpeg', filename: track.name || 'spotify', source: track.preview_url };
          }
        }
      }
    } catch (error) {
      // fall through
    }
  }

  if (platformLower === 'itunes' || platformLower === 'deezer') {
    try {
      const search = platformLower === 'itunes' ? mediaResolver.itunesSearch : mediaResolver.deezerSearch;
      const result = await search(query || url);
      const item = result?.result || result?.data?.[0] || result?.tracks?.[0];
      if (item) {
        const preview = item.preview_url || item.preview || item.track_preview || null;
        if (preview) {
          const response = await fetchPublicUrl(preview, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
          return { audio: response.buffer, mimeType: 'audio/mpeg', filename: item.name || item.title || 'preview', source: preview };
        }
      }
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
        const response = await fetchPublicUrl(video, { maxBytes: 100 * 1024 * 1024, accept: 'video/*,application/octet-stream' });
        return { audio: null, mimeType: response.contentType.split(';')[0].trim() || 'video/mp4', filename: result.title || 'tiktok', source: video };
      }
    } catch (error) {
      // fall through
    }
  }

  if (platformLower === 'audiomack') {
    try {
      const result = await mediaResolver.audiomackSearch(url || query);
      const track = result?.tracks?.[0] || result?.data?.[0];
      if (track) {
        const provider = track.url || track.stream_url || track.preview_url || null;
        if (provider) {
          const response = await fetchPublicUrl(provider, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
          return { audio: response.buffer, mimeType: 'audio/mpeg', filename: track.title || 'audiomack', source: provider };
        }
      }
    } catch (error) {
      // fall through
    }
  }

  return { originalUrl: url, error: 'This provider could not be resolved. Try the platform search.' };
}

module.exports = {
  name: 'download',
  aliases: ['directdownload'],
  category: 'media',
  description: 'Download a media file (video, audio, image) from a direct link or via a media resolver platform (TikTok, YouTube, SoundCloud, Spotify, Audiomack, iTunes/Deezer).',
  usage: '.download <media url>',

  async execute(sock, msg, args, extra) {
    try {
      const current = unwrapMessage(msg.message);
      const quoted = current.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedKey = current.extendedTextMessage?.contextInfo;

      const quotedMedia = quoted ? unwrapMessage(quoted) : null;
      const quotedIsVideo = quotedMedia?.videoMessage ||
        (quotedMedia?.documentMessage && String(quotedMedia?.documentMessage?.mimetype || '').startsWith('video/'));
      const quotedIsAudio = quotedMedia?.audioMessage ||
        (quotedMedia?.documentMessage && String(quotedMedia?.documentMessage?.mimetype || '').startsWith('audio/'));

      const directVideoMessage = current.videoMessage || (current.documentMessage && String(current.documentMessage.mimetype || '').startsWith('video/'));
      const directAudioMessage = current.audioMessage || (current.documentMessage && String(current.documentMessage.mimetype || '').startsWith('audio/'));

      let buffer;
      let mimeType = 'application/octet-stream';
      let fileName = 'download';

      if (quotedIsVideo) {
        const sourceMessage = { key: { remoteJid: extra.from, id: quotedKey?.stanzaId, participant: quotedKey?.participant }, message: quotedMedia };
        buffer = await downloadMediaMessage(sourceMessage, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        mimeType = quotedMedia.videoMessage?.mimetype || 'video/mp4';
        fileName = quotedMedia.videoMessage?.fileName || 'video';
      } else if (quotedIsAudio) {
        const sourceMessage = { key: { remoteJid: extra.from, id: quotedKey?.stanzaId, participant: quotedKey?.participant }, message: quotedMedia };
        buffer = await downloadMediaMessage(sourceMessage, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        mimeType = quotedMedia.audioMessage?.mimetype || 'audio/mpeg';
        fileName = quotedMedia.audioMessage?.fileName || 'audio';
      } else if (directVideoMessage || directAudioMessage) {
        const sourceMessage = { key: msg.key, message: current };
        buffer = await downloadMediaMessage(sourceMessage, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        mimeType = directVideoMessage?.mimetype || directAudioMessage?.mimetype || 'application/octet-stream';
        fileName = directVideoMessage?.fileName || directAudioMessage?.fileName || 'download';
      } else if (args[0]) {
        const url = String(args[0]).trim();
        if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
          return extra.reply('Provide a full http(s) URL, or reply to a media file you can share.');
        }
        const platform = mediaResolver.detectPlatform(url);
        const resolved = await resolveStream(url, platform, args.join(' ').trim());

        if (resolved.audio != null && resolved.audio.length > 0) {
          buffer = resolved.audio;
          mimeType = resolved.mimeType || 'audio/mpeg';
          fileName = resolved.filename || path.basename(new URL(resolved.source).pathname) || 'media';
        } else if (resolved.originalUrl) {
          const response = await fetchPublicUrl(resolved.originalUrl, {
            maxBytes: MAX_FILE_BYTES,
            accept: 'audio/*,video/*,image/*,application/octet-stream'
          });
          buffer = response.buffer;
          mimeType = response.contentType.split(';')[0].trim() || 'application/octet-stream';
          const extension = path.extname(response.url).toLowerCase();
          if (mimeType === 'application/octet-stream') {
            mimeType = AUDIO_TYPES[extension] || mimeType;
          }
          if (!['audio/', 'video/', 'image/'].some(prefix => mimeType.startsWith(prefix))) {
            throw new Error('The link did not return a direct audio, video, or image file.');
          }
          fileName = path.basename(new URL(response.url).pathname) || 'media';
        } else {
          throw new Error(resolved.error || 'Could not resolve a downloadable media source.');
        }
      } else {
        return extra.reply('Reply to a video or audio file, or use `.download <media URL>`.');
      }

      if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('The file is empty or could not be downloaded.');
      if (buffer.length > MAX_FILE_BYTES) throw new Error('Media must be 45 MB or smaller.');

      const isAudio = mimeType.startsWith('audio/');
      const isVideo = mimeType.startsWith('video/');

      if (isVideo) {
        return sock.sendMessage(extra.from, { video: buffer, mimetype: mimeType, caption: fileName, fileName }, { quoted: msg });
      }
      if (isAudio) {
        return sock.sendMessage(extra.from, { audio: buffer, mimetype: mimeType, ptt: false, fileName }, { quoted: msg });
      }
      return sock.sendMessage(extra.from, { image: buffer, mimetype: mimeType, caption: fileName }, { quoted: msg });
    } catch (error) {
      console.error('[download] failed:', error.message);
      return extra.reply(`Could not download that media: ${error.message}`);
    }
  }
};

