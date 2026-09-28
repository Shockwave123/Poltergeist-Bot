/**
 * SetBio Command - View or change the about/status text of the linked account
 */

module.exports = {
  name: 'setbio',
  aliases: ['bio', 'about', 'setstatus', 'setabout'],
  category: 'owner',
  description: 'View or change the account "about" text (owner only)',
  usage: '.setbio <new about text> | .setbio clear',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = extra.prefix || '.';
    const text = args.join(' ').trim();

    try {
      if (!text) {
        let current = 'unknown';
        try {
          const jid = sock.user?.id ? `${sock.user.id.split(':')[0].split('@')[0]}@s.whatsapp.net` : null;
          if (jid && typeof sock.fetchStatus === 'function') {
            const status = await sock.fetchStatus(jid);
            current = status?.status || 'not set';
          }
        } catch (error) {
          current = 'unavailable';
        }

        return extra.reply(
          '╭───『 📝 *ACCOUNT ABOUT* 』───\n' +
          '│\n' +
          `│ Current: ${current}\n` +
          '│\n' +
          `│ Change it with: \`${prefix}setbio Your new text\`\n` +
          `│ Remove it with: \`${prefix}setbio clear\`\n` +
          '╰─────────────────────────────'
        );
      }

      if (typeof sock.updateProfileStatus !== 'function') {
        return extra.reply('❌ This Baileys version cannot change the about text.');
      }

      const newText = ['clear', 'remove', 'delete', 'reset'].includes(text.toLowerCase())
        ? ''
        : text.slice(0, 139); // WhatsApp limit for the about text

      await sock.updateProfileStatus(newText);

      return extra.reply(
        newText
          ? `✅ About text updated to:\n\n_${newText}_`
          : '✅ About text cleared.'
      );
    } catch (error) {
      console.error('[setbio] failed:', error);
      return extra.reply(`❌ Could not update the about text: ${error.message}`);
    }
  }
};
