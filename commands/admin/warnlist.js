/** Warnlist: show and manage warnings for a group (admin) */

const database = require('../../database');

module.exports = {
  name: 'warnlist',
  aliases: ['warnings', 'showwarns', 'listwarns'],
  category: 'admin',
  description: 'Show all warnings issued in this group (admin only)',
  usage: '.warnlist | .warnlist @user | .warnlist clear @user',
  groupOnly: true,
  adminOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = extra.prefix || '.';
    const ctx = msg.message?.extendedTextMessage?.contextInfo;

    try {
      // "clear" sub-command wipes warnings for a mentioned user (or all if no mention)
      if ((args[0] || '').toLowerCase() === 'clear') {
        const mentioned = ctx?.mentionedJid?.[0];
        if (mentioned) {
          const number = String(mentioned).split('@')[0];
          if (typeof database.resetWarnings === 'function') {
            database.resetWarnings(extra.from, number);
          } else if (typeof database.clearWarnings === 'function') {
            database.clearWarnings(extra.from, number);
          } else {
            return extra.reply('❌ This database version cannot clear warnings.');
          }
          return extra.reply(`✅ Cleared warnings for +${number}.`);
        }
        if (typeof database.resetAllWarnings === 'function') {
          database.resetAllWarnings(extra.from);
          return extra.reply('✅ Cleared *all* warnings in this group.');
        }
        return extra.reply(`ℹ️ Mention a user: \`${prefix}warnlist clear @user\``);
      }

      // Read warnings
      let warnings = null;
      if (typeof database.getWarnings === 'function') warnings = database.getWarnings(extra.from);
      else if (typeof database.getWarnList === 'function') warnings = database.getWarnList(extra.from);

      if (!warnings || (typeof warnings === 'object' && !Array.isArray(warnings) && Object.keys(warnings).length === 0)) {
        return extra.reply('✅ No warnings recorded in this group yet.');
      }

      const entries = Array.isArray(warnings)
        ? warnings.map((w, i) => [typeof w === 'string' ? w : (w.number || w.user || `#${i}`), typeof w === 'object' && w.count ? w.count : 1])
        : Object.entries(warnings);

      const listed = entries.slice(0, 40).map(([number, count], index) =>
        `${index + 1}. +${String(number).split('@')[0]} — *${count}* warning(s)`
      );

      const lines = [
        `⚠️ *WARNLIST* (${entries.length} user(s))`,
        '',
        ...listed
      ];
      if (entries.length > listed.length) lines.push('', `… and ${entries.length - listed.length} more.`);
      lines.push('', `Clear with \`${prefix}warnlist clear @user\` or \`${prefix}warnlist clear\` for all.`);

      return extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('[warnlist] failed:', error);
      return extra.reply(`❌ Could not read the warn list: ${error.message}`);
    }
  }
};
