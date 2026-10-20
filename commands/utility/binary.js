/**
 * Binary Command - Encode/decode text to/from binary
 * Usage: .binary <text> --encode | .binary <01001000> --decode
 * Example: .binary Hello --encode
 * Example: .binary 01001000 01101001 --decode
 */

module.exports = {
  name: 'binary',
  aliases: ['bin'],
  category: 'utility',
  description: 'Encode/decode text to/from binary',
  usage: '.binary <text> --encode\n.binary <binary> --decode\nExample: .binary Hello --encode\nExample: .binary 01001000 01101001 --decode',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      if (args.length === 0) {
        return extra.reply(
          '🔢 *Binary Converter*\n\n' +
          'Usage: `.binary <text> --encode`\n' +
          'Example: `.binary Hello --encode`\n' +
          'Usage: `.binary <binary> --decode`\n' +
          'Example: `.binary 01001000 01101001 --decode`'
        );
      }

      const isDecode = args.includes('--decode');
      const textArgs = args.filter((a) => a !== '--decode');
      const input = textArgs.join(' ');

      if (!input) {
        return extra.reply('❌ No input provided.');
      }

      let result;
      let label;

      if (isDecode) {
        // Decode binary to text
        const binaryParts = input.split(/\s+/);
        const chars = [];
        for (const part of binaryParts) {
          if (!/^[01]+$/.test(part)) {
            return extra.reply(`❌ Invalid binary: "${part}". Use only 0s and 1s separated by spaces.`);
          }
          chars.push(String.fromCharCode(parseInt(part, 2)));
        }
        result = chars.join('');
        label = 'Binary Decode';
      } else {
        // Encode text to binary
        const bytes = [];
        for (let i = 0; i < input.length; i += 1) {
          bytes.push(input.charCodeAt(i).toString(2).padStart(8, '0'));
        }
        result = bytes.join(' ');
        label = 'Binary Encode';
      }

      await extra.reply(
        `🔢 *${label}*\n\n\`${result}\``
      );
    } catch (error) {
      console.error('[binary] error:', error);
      await extra.reply(`❌ Binary conversion failed: ${error.message}`);
    }
  }
};
