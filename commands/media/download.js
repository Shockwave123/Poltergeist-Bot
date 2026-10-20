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
  const failures = [];

  if (platformLower === 'soundcloud') {
    try {
      const stream = await mediaResolver.soundcloudStream(url || query);
      const response = await fetchPublicUrl(stream.url, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
      return { audio: response.buffer, mimeType: 'audio/mpeg', filename: `${stream.title || 'soundcloud'}.mp3`, source: stream.url };
    } catch (error) {
      failures.push(`soundcloud: ${error.message}`);
    }
  }

  if (platformLower === 'spotify') {
    try {
      const result = await mediaResolver.spotifyResolve(url || query);
      if (!result?.url) throw new Error('No downloadable preview is available for that Spotify link.');
      const response = await fetchPublicUrl(result.url, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
      return { audio: response.buffer, mimeType: result.mimetype || 'audio/mp4', filename: result.filename || 'spotify.m4a', source: result.url };
    } catch (error) {
      failures.push(`spotify: ${error.message}`);
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
      failures.push(`${platformLower}: ${error.message}`);
    }
  }

  if (platformLower === 'tiktok') {
    try {
      const result = await mediaResolver.tiktokDownload(url || query);
      const video = result?.videoUrl || result?.wmVideoUrl || null;
      if (video) {
        const response = await fetchPublicUrl(video, { maxBytes: MAX_FILE_BYTES, accept: 'video/*,application/octet-stream' });
        return { buffer: response.buffer, mimeType: response.contentType.split(';')[0].trim() || 'video/mp4', filename: `${result.title || 'tiktok'}.mp4`, source: video };
      }
      if (result?.musicUrl) {
        const response = await fetchPublicUrl(result.musicUrl, { maxBytes: MAX_AUDIO_BYTES, accept: 'audio/*,application/octet-stream' });
        return { audio: response.buffer, mimeType: 'audio/mpeg', filename: `${result.title || 'tiktok'}.mp3`, source: result.musicUrl };
      }
      throw new Error('TikWM did not return a media URL for that link.');
    } catch (error) {
      failures.push(`tiktok: ${error.message}`);
    }
  }

  if (platformLower === 'youtube') {
    try {
      const result = await mediaResolver.youtubeVideo(url, '720p');
      // youtubeDlVideo may return _buffer when ffmpeg merged locally
      if (result._buffer) {
        return {
          audio: null,
          buffer: result._buffer,
          mimeType: result.mimetype || 'video/mp4',
          filename: result.filename || 'youtube',
          source: result.source || url
        };
      }
      const response = await fetchPublicUrl(result.url, {
        maxBytes: MAX_FILE_BYTES,
        accept: 'video/*,application/octet-stream'
      });
      return {
        audio: null,
        buffer: response.buffer,
        mimeType: result.mimetype || response.contentType.split(';')[0].trim() || 'video/mp4',
        filename: result.filename || 'youtube',
        source: result.source || url
      };
    } catch (error) {
      failures.push(`youtube: ${error.message}`);
    }
  }

  if (platformLower === 'instagram') {
    try {
      const result = await mediaResolver.instagramDownload(url);
      if (result.videoUrl) {
        const response = await fetchPublicUrl(result.videoUrl, { maxBytes: MAX_FILE_BYTES, accept: 'video/*,application/octet-stream' });
        return { buffer: response.buffer, mimeType: response.contentType.split(';')[0].trim() || 'video/mp4', filename: `${mediaResolver.cleanName(result.title)}.mp4`, source: result.videoUrl };
      }
      if (result.imageUrl) {
        const response = await fetchPublicUrl(result.imageUrl, { maxBytes: MAX_FILE_BYTES, accept: 'image/*,application/octet-stream' });
        return { buffer: response.buffer, mimeType: response.contentType.split(';')[0].trim() || 'image/jpeg', filename: `${mediaResolver.cleanName(result.title)}.jpg`, source: result.imageUrl };
      }
      throw new Error('No downloadable media was found on that Instagram link.');
    } catch (error) {
      failures.push(`instagram: ${error.message}`);
    }
  }

  if (platformLower === 'facebook') {
    try {
      const result = await mediaResolver.facebookDownload(url);
      const response = await fetchPublicUrl(result.videoUrl, { maxBytes: MAX_FILE_BYTES, accept: 'video/*,application/octet-stream' });
      return { buffer: response.buffer, mimeType: response.contentType.split(';')[0].trim() || 'video/mp4', filename: 'facebook_video.mp4', source: result.videoUrl };
    } catch (error) {
      failures.push(`facebook: ${error.message}`);
    }
  }

  if (platformLower === 'twitter') {
    try {
      const result = await mediaResolver.twitterDownload(url);
      if (result.videoUrl) {
        const response = await fetchPublicUrl(result.videoUrl, { maxBytes: MAX_FILE_BYTES, accept: 'video/*,application/octet-stream' });
        return { buffer: response.buffer, mimeType: response.contentType.split(';')[0].trim() || 'video/mp4', filename: `${result.author || 'twitter'}.mp4`, source: result.videoUrl };
      }
      if (result.imageUrl) {
        const response = await fetchPublicUrl(result.imageUrl, { maxBytes: MAX_FILE_BYTES, accept: 'image/*,application/octet-stream' });
        return { buffer: response.buffer, mimeType: response.contentType.split(';')[0].trim() || 'image/jpeg', filename: `${result.author || 'twitter'}.jpg`, source: result.imageUrl };
      }
      throw new Error('That post has no downloadable media.');
    } catch (error) {
      failures.push(`twitter: ${error.message}`);
    }
  }

  if (platformLower === 'pinterest') {
    try {
      const result = await mediaResolver.pinterestDownload(url);
      const media = result.videoUrl || result.imageUrl;
      if (!media) throw new Error('No media found on that pin.');
      const isVideo = Boolean(result.videoUrl);
      const response = await fetchPublicUrl(media, {
        maxBytes: MAX_FILE_BYTES,
        accept: isVideo ? 'video/*,application/octet-stream' : 'image/*,application/octet-stream'
      });
      return {
        buffer: response.buffer,
        mimeType: response.contentType.split(';')[0].trim() || (isVideo ? 'video/mp4' : 'image/jpeg'),
        filename: isVideo ? 'pinterest.mp4' : 'pinterest.jpg',
        source: media
      };
    } catch (error) {
      failures.push(`pinterest: ${error.message}`);
    }
  }

  if (platformLower === 'mediafire' || platformLower === 'gofile') {
    try {
      const result = platformLower === 'mediafire'
        ? await mediaResolver.mediafireDownload(url)
        : await mediaResolver.gofileDownload(url);
      const response = await fetchPublicUrl(result.url, { maxBytes: MAX_FILE_BYTES, accept: '*/*' });
      const fallbackName = path.basename(new URL(result.url).pathname) || 'file';
      return {
        buffer: response.buffer,
        mimeType: response.contentType.split(';')[0].trim() || 'application/octet-stream',
        filename: result.filename || fallbackName,
        source: result.url,
        asDocument: true
      };
    } catch (error) {
      failures.push(`${platformLower}: ${error.message}`);
    }
  }

  if (platformLower === 'audiomack') {
    failures.push('audiomack: Audiomack does not expose public stream URLs — open the track in the Audiomack app instead.');
  }

  if (platformLower && platformLower !== 'direct') {
    throw new Error(failures.length ? failures.join('\n') : 'This provider could not be resolved.');
  }

  return { originalUrl: url, error: 'This provider could not be resolved. Try the platform search.' };
}

module.exports = {
  name: 'download',
  aliases: ['directdownload'],
  category: 'media',
  description: 'Download media from links: TikTok, YouTube, Instagram, Facebook, Twitter/X, Pinterest, SoundCloud, Spotify, iTunes/Deezer, MediaFire and GoFile — or reply to a media message.',
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
      let asDocument = false;

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

        if (resolved.buffer && resolved.buffer.length > 0) {
          buffer = resolved.buffer;
          mimeType = resolved.mimeType || 'application/octet-stream';
          fileName = resolved.filename || path.basename(new URL(resolved.source || url).pathname) || 'media';
          asDocument = Boolean(resolved.asDocument);
        } else if (resolved.audio != null && resolved.audio.length > 0) {
          buffer = resolved.audio;
          mimeType = resolved.mimeType || 'audio/mpeg';
          fileName = resolved.filename || path.basename(new URL(resolved.source || url).pathname) || 'media';
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

      if (asDocument) {
        return sock.sendMessage(extra.from, { document: buffer, mimetype: mimeType, fileName }, { quoted: msg });
      }
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

