/**
 * Leave Command - Leave the current group from the linked WhatsApp account
 */

module.exports = {
  name: 'leave',
  aliases: ['leavegroup', 'exitgroup'],
  category: 'admin',
  description: 'Make the bot leave this group',
  usage: '.leave',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const confirm = (args[0] || '').toLowerCase();
      if (confirm !== 'yes') {
        return extra.reply(
          '⚠️ *Confirm group exit*\n\n' +
          'The bot will leave this group and you will need an invite link to add it back.\n\n' +
          `Send \`${extra.prefix || '.'}leave yes\` to confirm.`
        );
      }

      if (typeof sock.groupLeave !== 'function') {
        return extra.reply('❌ This Baileys version cannot leave groups from code.');
      }

      await extra.reply('👋 Leaving this group now. Goodbye!');
      await sock.groupLeave(extra.from);
    } catch (error) {
      console.error('[leave] failed:', error);
      try {
        await sock.sendMessage(extra.from, { text: `❌ Could not leave the group: ${error.message}` }, { quoted: msg });
      } catch (sendError) {
        // Group may already be gone
      }
    }
  }
};
