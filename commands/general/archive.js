/**
 * Archive Command - Archive or unarchive the current chat
 * (works for group chats and for the DM you are chatting in)
 */

const { archiveChat } = require('../../utils/chatActions');

module.exports = {
  name: 'archive',
  aliases: ['unarchive', 'archivedchat'],
  category: 'general',
  description: 'Archive or unarchive this chat in your WhatsApp account',
  usage: '.archive - toggle | .archive on | .archive off',

  async execute(sock, msg, args, extra) {
    const action = (args[0] || '').toLowerCase();
    try {
      let archive;
      if (['on', 'yes', 'true', 'archive'].includes(action)) archive = true;
      else if (['off', 'no', 'false', 'unarchive', 'restore'].includes(action)) archive = false;
      else if (!action) archive = true; // default: archive
      else return extra.reply(`❌ Unknown option *${action}*.\n\nUsage: \`${extra.prefix || '.'}archive\` | \`${extra.prefix || '.'}archive off\``);

      await archiveChat(sock, extra.from, archive, msg);

      return extra.reply(
        archive
          ? `🗄️ This chat has been *archived*.\n\nUse \`${extra.prefix || '.'}archive off\` to move it back to your main chat list.`
          : '📥 This chat has been *unarchived* and is back in your main chat list.'
      );
    } catch (error) {
      console.error('[archive] failed:', error);
      return extra.reply(`❌ Could not update the archive state: ${error.message}`);
    }
  }
};
