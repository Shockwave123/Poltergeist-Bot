/**
 * Password Command - Generate a random password
 * Usage: .password [length]
 * Example: .password 16
 */

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

function pickRandom(chars) {
  return chars.charAt(Math.floor(Math.random() * chars.length));
}

module.exports = {
  name: 'password',
  aliases: ['passwd', 'genpass'],
  category: 'utility',
  description: 'Generate a strong random password',
  usage: '.password [length]  |  Example: .password 16',
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;

      let length = args.length > 0 ? parseInt(args[0], 10) : 16;
      if (!length || length < 4 || length > 128) {
        length = 16;
      }

      const all = LOWER + UPPER + DIGITS + SYMBOLS;
      let password = '';

      // Ensure at least one of each category
      password += pickRandom(LOWER);
      password += pickRandom(UPPER);
      password += pickRandom(DIGITS);
      password += pickRandom(SYMBOLS);

      while (password.length < length) {
        password += pickRandom(all);
      }

      // Shuffle to randomize positions
      password = password.split('').sort(() => Math.random() - 0.5).join('');

      await sock.sendMessage(chatId, {
        text: `🔑 *Generated Password*\n\n\`${password}\`\nLength: ${length} characters\n\n⚠️ Save it somewhere safe!`
      }, { quoted: msg });

    } catch (error) {
      console.error('[password] error:', error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: '❌ Password generation failed.'
      }, { quoted: msg });
    }
  }
};
