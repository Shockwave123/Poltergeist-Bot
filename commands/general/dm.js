/**
 * DM Command - Open a private chat with a user (mention, reply, or number)
 *
 * Fixes:
 *  - @mention/LID resolution: modern WA sends LID JIDs in mentionedJid.
 *    We now normalise through jidHelper so LIDs are converted to real phone
 *    numbers before building the wa.me link.
 *  - Reply-to: if the command is a reply to someone's message we also extract
 *    the target from ctx.participant (the quoted sender), which works in groups
 *    even when no explicit @mention is present.
 */

const { normalizeJidWithLid } = require('../../utils/jidHelper');

/**
 * Resolve a raw JID (may be LID, phone-number JID, or bare digits) to a
 * clean phone-number string.  Returns null if resolution fails.
 */
function resolveToPhone(rawJid) {
  if (!rawJid) return null;
  try {
    // normalizeJidWithLid converts LID -> phone-number JID where possible
    const normalized = normalizeJidWithLid(
      rawJid.includes('@') ? rawJid : `${rawJid.replace(/\D/g, '')}@s.whatsapp.net`
    );
    // Extract the user part (before @) and strip device suffix (e.g. ":16")
    const user = normalized.split('@')[0].split(':')[0];
    const digits = user.replace(/\D/g, '');
    return digits.length >= 7 ? digits : null;
  } catch {
    return null;
  }
}

module.exports = {
  name: 'dm',
  aliases: ['opendm', 'privatemsg', 'pm'],
  category: 'general',
  description: 'Open a private chat hint with a number (works in groups, for everyone)',
  usage: '.dm 2348012345678  |  .dm @mention  |  reply to someone + .dm',

  async execute(sock, msg, args, extra) {
    const prefix = extra.prefix || '.';

    try {
      // ── 1. Gather candidate sources in priority order ─────────────────────
      const ctx =
        msg.message?.extendedTextMessage?.contextInfo ||
        msg.message?.imageMessage?.contextInfo ||
        msg.message?.videoMessage?.contextInfo;

      // a) Explicit @mention in the message (mentionedJid array) — from contextInfo or extra
      const mentionJid = ctx?.mentionedJid?.[0] || (extra.mentionedJid?.[0] || null);

      // b) Reply-to: the quoted message's sender
      const replyJid = ctx?.participant || null;

      // c) Plain number/JID typed as first arg (e.g. ".dm 2348012345678")
      const argDigits = args[0] ? String(args[0]).replace(/\D/g, '') : '';

      // ── 2. Try each source in order ───────────────────────────────────────
      let digits = null;

      // Prefer explicit @mention first
      if (mentionJid) {
        digits = resolveToPhone(mentionJid);
      }

      // Then try a reply-to
      if (!digits && replyJid) {
        digits = resolveToPhone(replyJid);
      }

      // Then try the typed argument
      if (!digits && argDigits.length >= 7) {
        digits = argDigits;
      }

      // ── 3. Nothing usable found → show help ───────────────────────────────
      if (!digits) {
        return extra.reply(
          'ℹ️ *Open a private chat quickly*\n\n' +
          `Usage:\n` +
          `• \`${prefix}dm 2348012345678\`\n` +
          `• @mention someone and send \`${prefix}dm\`\n` +
          `• Reply to someone's message and send \`${prefix}dm\`\n\n` +
          'The bot replies with a tappable link so you can jump straight into that DM.'
        );
      }

      // ── 4. Build the response ─────────────────────────────────────────────
      return extra.reply(
        '📩 *PRIVATE CHAT SHORTCUT*\n\n' +
        `Number: +${digits}\n` +
        `Chat link: https://wa.me/${digits}\n\n` +
        `Tap the link above to open a chat with +${digits}, ` +
        `or search the number in WhatsApp directly.\n\n` +
        `Tip: use \`${prefix}block ${digits}\` / \`${prefix}unblock ${digits}\` to manage them (owner).`
      );
    } catch (error) {
      console.error('[dm] failed:', error);
      return extra.reply(`❌ Could not build the chat link: ${error.message}`);
    }
  },
};
