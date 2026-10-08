const path = require('node:path');
const { fetchPublicUrl } = require('../../utils/webContent');

const MAX_FILE_BYTES = 45 * 1024 * 1024;
const EXTENSION_MIME_TYPES = {
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

module.exports = {
  name: 'download',
  aliases: ['directdownload'],
  category: 'media',
  description: 'Download a public direct media-file link (not a social or streaming page)',
  usage: '.download <direct file URL>',

  async execute(sock, msg, args, extra) {
    const url = args[0];
    if (!url) return extra.reply('Send a direct public HTTP(S) link to an audio, video, or image file. Social and streaming page links are not supported.');

    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (/(^|\.)(youtube\.com|youtu\.be|spotify\.com|instagram\.com|tiktok\.com|facebook\.com|fb\.watch)$/.test(hostname)) {
        return extra.reply('That is a streaming/social page, not a direct media file. This bot does not extract streams from those platforms. Use the platform’s own export/download option, then send the resulting file or a direct authorized file URL.');
      }
      const response = await fetchPublicUrl(url, { maxBytes: MAX_FILE_BYTES, accept: 'audio/*,video/*,image/*,application/octet-stream' });
      let mimeType = response.contentType.split(';')[0].trim();
      const filename = getFilename(response.url, response.headers['content-disposition']);
      const extension = path.extname(filename).toLowerCase();
      if (mimeType === 'application/octet-stream') {
        mimeType = EXTENSION_MIME_TYPES[extension] || mimeType;
      }
      const isKnownMedia = mimeType.startsWith('audio/') || mimeType.startsWith('video/') || mimeType.startsWith('image/');
      if (!isKnownMedia) {
        return extra.reply('That link did not return a direct audio, video, or image file. Try a direct file URL rather than a webpage.');
      }
      if (mimeType.startsWith('image/') && response.buffer.length > 10 * 1024 * 1024) {
        return extra.reply('Images must be 10 MB or smaller.');
      }

      if (mimeType.startsWith('audio/')) {
        return sock.sendMessage(extra.from, {
          audio: response.buffer,
          mimetype: mimeType,
          ptt: false,
          fileName: filename
        }, { quoted: msg });
      }
      if (mimeType.startsWith('video/')) {
        return sock.sendMessage(extra.from, {
          video: response.buffer,
          mimetype: mimeType,
          caption: filename
        }, { quoted: msg });
      }
      return sock.sendMessage(extra.from, {
        image: response.buffer,
        mimetype: mimeType,
        caption: filename
      }, { quoted: msg });
    } catch (error) {
      console.error('[download] failed:', error.message);
      return extra.reply(`Could not download that file: ${error.message}`);
    }
  }
};