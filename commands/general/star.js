/** Star or unstar the current chat in the linked WhatsApp account */

const { pinChat } = require('../../utils/chatActions');

module.exports = {
  name: 'star',
  aliases: ['starchat', 'unstarchat'],
  category: 'general',
  description: 'Star or unstar this chat in your WhatsApp account (falls back to pin)',
  usage: '.star - star | .star off - unstar',

  async execute(sock, msg, args, extra) {
    const action = (args[0] || '').toLowerCase();
    const prefix = extra.prefix || '.';

    try {
      const star = ['off', 'no', 'false', 'unstar'].includes(action) ? false : true;

      // Baileys exposes chat starring via the pin API on recent versions;
      // if starring is unsupported we fall back to pin/unpin so the command still helps.
      if (typeof sock.addChatLabel === 'function' || typeof sock.starChat === 'function') {
        const fn = sock.starChat || sock.addChatLabel;
        await fn(extra.from, star);
        return extra.reply(star ? '⭐ This chat has been *starred*.' : '⭐ This chat has been *unstarred*.');
      }

      await pinChat(sock, extra.from, star);
      return extra.reply(
        star
          ? '📌 Star is not supported by this Baileys version, so this chat was *pinned* instead.'
          : '📌 This chat has been *unpinned* (unstar fallback).'
      );
    } catch (error) {
      console.error('[star] failed:', error);
      return extra.reply(`❌ Could not update the star state: ${error.message}`);
    }
  }
};
