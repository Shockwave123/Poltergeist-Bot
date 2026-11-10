/**
 * Antibadword Command - Detect and delete bad words (delete/kick/warn)
 */

const database = require('../../database');
const { normalizeBadWord } = require('../../utils/badwords');

module.exports = {
  name: 'antibadword',
  aliases: ['antibad', 'nobadword'],
  category: 'admin',
  description: 'Configure antibadword protection (delete/kick/warn)',
  usage: '.antibadword <on/off/set/add/remove/list>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antibadword ? 'ON' : 'OFF';
        const action = settings.antibadwordAction || 'delete';
        const words = Array.isArray(settings.antibadwordWords) ? settings.antibadwordWords : [];
        return extra.reply(
          `🚫 *Antibadword Status*\n\n` +
          `Status: *${status}*\n` +
          `Action: *${action}*\n\n` +
          `Usage:\n` +
          `  .antibadword on\n` +
          `  .antibadword off\n` +
          `  .antibadword set delete | kick | warn\n` +
          `  .antibadword add <word or phrase>\n` +
          `  .antibadword remove <word or phrase>\n` +
          `  .antibadword list\n` +
          `  .antibadword get\n\n` +
          `Custom words: ${words.length}`
        );
      }

      const opt = args[0].toLowerCase();
      const settings = database.getGroupSettings(extra.from);
      const words = Array.isArray(settings.antibadwordWords) ? settings.antibadwordWords : [];

      if (opt === 'add' || opt === 'remove') {
        const word = normalizeBadWord(args.slice(1).join(' '));
        if (!word) {
          return extra.reply(`*Usage: .antibadword ${opt} <word or phrase>*`);
        }

        const existing = words.map(normalizeBadWord).filter(Boolean);
        if (opt === 'add') {
          if (existing.includes(word)) {
            return extra.reply(`*“${word}” is already in the antibadword list.*`);
          }
          database.updateGroupSettings(extra.from, { antibadwordWords: [...existing, word] });
          return extra.reply(`*Added “${word}” to the antibadword list.*`);
        }

        if (!existing.includes(word)) {
          return extra.reply(`*“${word}” is not in the antibadword list.*`);
        }
        database.updateGroupSettings(extra.from, {
          antibadwordWords: existing.filter((entry) => entry !== word),
        });
        return extra.reply(`*Removed “${word}” from the antibadword list.*`);
      }

      if (opt === 'list' || opt === 'words' || opt === 'show') {
        const customWords = [...new Set(words.map(normalizeBadWord).filter(Boolean))];
        return extra.reply(customWords.length
          ? `🚫 *Custom antibadword list* (${customWords.length})\n\n${customWords.map((word, i) => `${i + 1}. ${word}`).join('\n')}`
          : '*No custom bad words have been added for this group yet.*');
      }

      if (opt === 'on') {
        if (settings.antibadword) {
          return extra.reply('*Antibadword is already on*');
        }
        database.updateGroupSettings(extra.from, { antibadword: true });
        return extra.reply('*Antibadword has been turned ON*');
      }

      if (opt === 'off') {
        database.updateGroupSettings(extra.from, { antibadword: false });
        return extra.reply('*Antibadword has been turned OFF*');
      }

      if (opt === 'set') {
        if (args.length < 2) {
          return extra.reply('*Please specify an action: .antibadword set delete | kick | warn*');
        }

        const setAction = args[1].toLowerCase();
        if (!['delete', 'kick', 'warn'].includes(setAction)) {
          return extra.reply('*Invalid action. Choose delete, kick, or warn.*');
        }

        database.updateGroupSettings(extra.from, {
          antibadwordAction: setAction,
          antibadword: true,
        });
        return extra.reply(`*Antibadword action set to ${setAction}*`);
      }

      if (opt === 'get') {
        const status = settings.antibadword ? 'ON' : 'OFF';
        const action = settings.antibadwordAction || 'delete';
        return extra.reply(`*Antibadword Configuration:*\nStatus: ${status}\nAction: ${action}`);
      }

      return extra.reply('*Use .antibadword for usage.*');
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  },
};
