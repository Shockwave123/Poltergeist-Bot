/** Helper command: quickly open a private chat with a number (works for everyone) */

const { normalizeJidWithLid } = require('../../utils/jidHelper');

module.exports = {
  name: 'dm',
  aliases: ['opendm', 'privatemsg', 'pm'],
  category: 'general',
  description: 'Open a private chat hint with a number (works in groups, for everyone)',
  usage: '.dm 2348012345678 | .dm @user (via mention)',

  async execute(sock, msg, args, extra) {
    const prefix = extra.prefix || '.';

    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo
        || msg.message?.imageMessage?.contextInfo;

      let target = args[0] || '';
      if ((!target || !/\d{8,}/.test(target)) && ctx?.mentionedJid?.length) {
        target = String(ctx.mentionedJid[0]).split('@')[0];
      }

      const digits = String(target).replace(/[^0-9]/g, '');
      if (digits.length < 8) {
        return extra.reply(
          'ℹ️ *Open a private chat quickly*\n\n' +
          `Usage:\n• \`${prefix}dm 2348012345678\`\n• Reply/mention someone and send \`${prefix}dm\`\n\n` +
          'The bot replies with a tappable chat link so you can jump straight into that DM.'
        );
      }

      const jid = normalizeJidWithLid(`${digits}@s.whatsapp.net`);

      return extra.reply(
        '📩 *PRIVATE CHAT SHORTCUT*\n\n' +
        `Number: +${digits}\n` +
        `Chat link: https://wa.me/${digits}\n\n` +
        `Tap the link above to open a chat with +${digits}, or search the number in WhatsApp directly.\n\n` +
        `Tip: use \`${prefix}block ${digits}\` / \`${prefix}unblock ${digits}\` to manage them (owner).`
      );
    } catch (error) {
      console.error('[dm] failed:', error);
      return extra.reply(`❌ Could not build the chat link: ${error.message}`);
    }
  }
};
