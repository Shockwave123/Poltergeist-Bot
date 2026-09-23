/** Helper commands for the linked WhatsApp account (owner only) */

const config = require('../../config');
const { normalizeJidWithLid } = require('../../utils/jidHelper');

const numberFromJid = (jid) => String(jid || '').split(':')[0].split('@')[0];

const resolveJid = (target) => {
  if (!target) return null;
  const cleaned = String(target).replace(/[^0-9]/g, '');
  if (cleaned.length < 8) return null;
  return normalizeJidWithLid(`${cleaned}@s.whatsapp.net`);
};

module.exports = {
  name: 'pushname',
  aliases: ['setname', 'changename'],
  category: 'owner',
  description: 'View or change the WhatsApp display name of the linked account (owner only)',
  usage: '.pushname | .pushname <new name> | .pushname reset',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = extra.prefix || '.';
    const text = args.join(' ').trim();

    try {
      if (!text) {
        const current = sock.user?.name || 'unknown';
        return extra.reply(
          '╭───『 👤 *DISPLAY NAME* 』───\n' +
          '│\n' +
          `│ Current: *${current}*\n` +
          '│\n' +
          `│ Change it with: \`${prefix}pushname Your Name\`\n` +
          `│ Keep it unchanged with: \`${prefix}pushname reset\`\n` +
          '╰─────────────────────────────'
        );
      }

      if (typeof sock.updateProfileName !== 'function') {
        return extra.reply('❌ This Baileys version cannot change the display name.');
      }

      if (['reset', 'default', 'keep'].includes(text.toLowerCase())) {
        return extra.reply(`✅ Display name left as *${sock.user?.name || 'unknown'}* (no change made).`);
      }

      const newName = text.slice(0, 25); // WhatsApp display-name limit
      await sock.updateProfileName(newName);

      return extra.reply(`✅ Display name updated to *${newName}*.`);
    } catch (error) {
      console.error('[pushname] failed:', error);
      return extra.reply(`❌ Could not update the display name: ${error.message}`);
    }
  }
};
