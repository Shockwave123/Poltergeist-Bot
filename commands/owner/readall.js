/** Read-all: mark every unread chat as read in the linked account (owner only) */

module.exports = {
  name: 'readall',
  aliases: ['markallread', 'clearunread'],
  category: 'owner',
  description: 'Mark every unread chat as read in your WhatsApp account (owner only)',
  usage: '.readall | .readall unread - mark all as unread',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const action = (args[0] || '').toLowerCase();
    const prefix = extra.prefix || '.';

    try {
      if (typeof sock.getChatList !== 'function' || typeof sock.chatRead !== 'function') {
        return extra.reply('❌ This Baileys version cannot bulk-update read state.');
      }

      const markRead = !['unread', 'no', 'false'].includes(action);
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
          if (markRead) {
            await sock.chatRead(jid);
          } else {
            // Baileys has no "mark unread" API for a whole chat; skip quietly
            failed += 1;
            continue;
          }
          done += 1;
        } catch (error) {
          failed += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (!markRead) {
        return extra.reply(
          `⚠️ WhatsApp does not allow marking whole chats as *unread* from a linked device.\n\n` +
          `Use \`${prefix}markread unread\` inside a single chat instead.`
        );
      }

      return extra.reply(`✅ Marked *${done}* chat(s) as read${failed ? ` (${failed} skipped)` : ''}.`);
    } catch (error) {
      console.error('[readall] failed:', error);
      return extra.reply(`❌ Could not update the chats: ${error.message}`);
    }
  }
};
