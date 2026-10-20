/**
 * Encode Command - Encode/decode text in various formats
 * Usage: .encode <format> <text>
 * Formats: base64, base64url, hex, url, rot13
 * Example: .encode base64 Hello World
 * Example: .encode base64 --decode SGVsbG8gV29ybGQ=
 */

module.exports = {
  name: 'encode',
  aliases: ['code'],
  category: 'utility',
  description: 'Encode/decode text: base64, hex, url, rot13',
  usage: '.encode <format> <text>  |  .encode <format> --decode <text>\nFormats: base64, hex, url, rot13',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length < 2) {
        return await sock.sendMessage(chatId, {
          text: '❌ Usage: `.encode <format> <text>`\n' +
            'Example: `.encode base64 Hello World`\n' +
            'Example: `.encode base64 --decode SGVsbG8gV29ybGQ=`\n' +
            'Formats: base64, hex, url, rot13'
        }, { quoted: msg });
      }

      const format = args[0].toLowerCase();
      const isDecode = args.includes('--decode');
      const textArgs = args.slice(1).filter((a) => a !== '--decode');
      const text = textArgs.join(' ');

      if (!text) {
        return await sock.sendMessage(chatId, { text: '❌ No text provided.' }, { quoted: msg });
      }

      let result;
      let label;

      switch (format) {
        case 'base64':
          if (isDecode) {
            result = Buffer.from(text, 'base64').toString('utf8');
            label = 'Base64 Decode';
          } else {
            result = Buffer.from(text, 'utf8').toString('base64');
            label = 'Base64 Encode';
          }
          break;
        case 'hex':
          if (isDecode) {
            result = Buffer.from(text, 'hex').toString('utf8');
            label = 'Hex Decode';
          } else {
            result = Buffer.from(text, 'utf8').toString('hex');
            label = 'Hex Encode';
          }
          break;
        case 'url':
          if (isDecode) {
            result = decodeURIComponent(text);
            label = 'URL Decode';
          } else {
            result = encodeURIComponent(text);
            label = 'URL Encode';
          }
          break;
        case 'rot13':
          result = text.replace(/[a-zA-Z]/g, (c) =>
            String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)
          );
          label = 'ROT13';
          break;
        default:
          return await sock.sendMessage(chatId, {
            text: '❌ Unknown format. Use: base64, hex, url, rot13'
          }, { quoted: msg });
      }

      await sock.sendMessage(chatId, {
        text: `🔐 *${label}*\n\n${result}`
      }, { quoted: msg });

    } catch (error) {
      console.error('[encode] error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ Encode/decode failed: ' + (error.message || 'Unknown error')
      }, { quoted: msg });
    }
  }
};
