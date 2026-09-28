/** Archive all chats in the linked WhatsApp account (owner only) */

const { archiveChat } = require('../../utils/chatActions');

module.exports = {
  name: 'archiveall',
  aliases: ['archiveeverywhere', 'cleaninbox'],
  category: 'owner',
  description: 'Archive every chat in your WhatsApp account to tidy the inbox (owner only)',
  usage: '.archiveall - archive every chat | .archiveall off - unarchive all',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const action = (args[0] || '').toLowerCase();
    const prefix = extra.prefix || '.';

    try {
      if (typeof sock.getChatList !== 'function') {
        return extra.reply('❌ This Baileys version cannot list chats.');
      }

      const archive = !['off', 'unarchive', 'no', 'false'].includes(action);
      const chats = await sock.getChatList();

      if (!Array.isArray(chats) || chats.length === 0) {
        return extra.reply('ℹ️ No chats found in the account yet.');
      }

      let done = 0;
      let failed = 0;
      for (const chat of chats) {
        const jid = typeof chat === 'string' ? chat : chat.id;
        if (!jid || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) continue;
        try {
          await archiveChat(sock, jid, archive, null);
          done += 1;
        } catch (error) {
          failed += 1;
        }
        // Small delay so WhatsApp does not rate-limit the bulk action
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      return extra.reply(
        archive
          ? `🗄️ Archived *${done}* chat(s)${failed ? ` (${failed} failed)` : ''}.\n\nUse \`${prefix}archiveall off\` to bring them all back.`
          : `📥 Unarchived *${done}* chat(s)${failed ? ` (${failed} failed)` : ''}. They are back in your main list.`
      );
    } catch (error) {
      console.error('[archiveall] failed:', error);
      return extra.reply(`❌ Could not update the chats: ${error.message}`);
    }
  }
};
