const path = require('node:path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { fetchPublicUrl } = require('../../utils/webContent');
const { buildPlatformSearchLink } = require('../../utils/platformSearch');
const mediaResolver = require('../../utils/mediaResolver');

const MAX_AUDIO_BYTES = 45 * 1024 * 1024;
const AUDIO_TYPES = {
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.oga': 'audio/ogg', '.webm': 'audio/webm'
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
      const result = await mediaResolver.soundcloudSearch(url || query);
      const track = result?.tracks?.[0] || result?.data?.[0];
      if (track) {
        const provider = track.hasOwnProperty('url') ? track.url
          : track.hasOwnProperty('stream_url') ? track.stream_url
          : track.hasOwnProperty('preview_url') ? track.preview_url
          : null;
        if (provider) {
          const response = await fetchPublicUrl(provider, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
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
          return { audio: response.buffer, mimeType: 'audio/mpeg', filename: track.title || track.name || 'audiomack', source: provider };
        }
      }
    } catch (error) {
      // fall through
    }
  }

  return null;
}

module.exports = {
  name: 'play',
  aliases: ['playaudio'],
  category: 'media',
  description: 'Play an audio track: reply to an audio file, or play a media link via the media resolver (SoundCloud, Spotify, iTunes/Deezer preview, TikTok, Audiomack).',
  usage: '.play (reply to audio) or .play <media url>',

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

        if (resolved.audio != null && resolved.audio.length > 0) {
          audio = resolved.audio;
          mimetype = resolved.mimeType || 'audio/mpeg';
          fileName = resolved.filename || path.basename(new URL(resolved.source).pathname) || 'audio';
        } else if (resolved.originalUrl) {
          const response = await fetchPublicUrl(resolved.originalUrl, {
            maxBytes: MAX_AUDIO_BYTES,
            accept: 'audio/*,application/octet-stream'
          });
          audio = response.buffer;
          mimetype = response.contentType.split(';')[0].trim() || 'audio/mpeg';
          const extension = path.extname(response.url).toLowerCase();
          if (mimetype === 'application/octet-stream') {
            mimetype = AUDIO_TYPES[extension] || mimetype;
          }
          if (!mimetype.startsWith('audio/')) {
            throw new Error('The link must return a direct audio file, not a streaming or social page.');
          }
          fileName = path.basename(new URL(response.url).pathname) || 'audio';
        } else {
          throw new Error(resolved.error || 'Could not resolve a playable audio source.');
        }
      } else {
        return extra.reply('Reply to an audio file with `.play`, or use `.play <media URL>`.');
      }

      if (!Buffer.isBuffer(audio) || !audio.length) throw new Error('The audio file is empty or could not be downloaded.');
      if (audio.length > MAX_AUDIO_BYTES) throw new Error('Audio must be 45 MB or smaller.');

      return sock.sendMessage(extra.from, { audio, mimetype, ptt: false, fileName }, { quoted: msg });
    } catch (error) {
      console.error('[play] failed:', error.message);
      return extra.reply(`Could not send that audio: ${error.message}`);
    }
  }
};