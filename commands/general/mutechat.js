/**
 * MuteChat Command - Mute or unmute the current chat
 * Note: this mutes the chat in the linked WhatsApp account (not the group mute feature).
 */

const { muteChat, parseDuration, formatMuteDuration } = require('../../utils/chatActions');

const PRESETS = {
  '8h': 8 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  forever: 365 * 24 * 60 * 60 * 1000
};

module.exports = {
  name: 'mutechat',
  aliases: ['unmutechat', 'chatmute', 'silence'],
  category: 'general',
  description: 'Mute or unmute this chat in your WhatsApp account',
  usage: '.mutechat 8h | .mutechat 1d | .mutechat 7d | .mutechat forever | .mutechat off',

  async execute(sock, msg, args, extra) {
    const option = (args[0] || '').toLowerCase().replace(/\s+/g, '');
    const prefix = extra.prefix || '.';

    try {
      let duration;

      if (!option) {
        duration = PRESETS['8h'];
      } else if (['off', 'no', 'false', 'unmute', 'never'].includes(option)) {
        duration = null;
      } else if (PRESETS[option]) {
        duration = PRESETS[option];
      } else {
        duration = parseDuration(option);
      }

      if (duration === undefined) {
        return extra.reply(
          `❌ Unknown duration *${option}*.\n\n` +
          `Usage: \`${prefix}mutechat 8h\` | \`${prefix}mutechat 1d\` | \`${prefix}mutechat 7d\` | \`${prefix}mutechat forever\` | \`${prefix}mutechat off\``
        );
      }

      await muteChat(sock, extra.from, duration);

      return extra.reply(
        duration === null
          ? '🔔 Notifications for this chat are *on* again (unmuted).'
          : `🔕 This chat is now *muted* for ${formatMuteDuration(duration)}.`
      );
    } catch (error) {
      console.error('[mutechat] failed:', error);
      return extra.reply(`❌ Could not update the mute state: ${error.message}`);
    }
  }
};
