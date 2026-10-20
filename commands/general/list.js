/**
 * List Command
 * Show all commands grouped by folder with aliases and descriptions
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { groupCommands } = require('../../utils/commandPresentation');
const { sendButtons } = require('gifted-btns');

const shorten = (value, maxLength = 70) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
};

module.exports = {
  name: 'list',
  aliases: [],
  description: 'List all commands grouped by folder',
  usage: '.list',
  category: 'general',

  async execute(sock, msg, args, extra) {
    try {
      const prefix = config.prefix;
      const groups = groupCommands(loadCommands());
      const commandCount = groups.reduce((total, group) => total + group.commands.length, 0);

      const lines = groups.flatMap((group) => {
        const entries = group.commands.map((command) => {
          const names = [command.name, ...(command.aliases || [])].map((name) => `${prefix}${name}`).join(', ');
          const label = shorten(command.description || command.desc);
          return label ? `• \`${names}\` — ${label}` : `• \`${names}\``;
        });
        return [`${group.icon} *${group.label}* · ${group.commands.length}`, ...entries, ''];
      });

      const menu = [
        `╭─ *${config.botName}* ─╮`,
        `📇 *COMMANDS LIST* · ${commandCount} total`,
        `Prefix: *${prefix}*`,
        '━━━━━━━━━━━━━━━━',
        ...lines,
        `Use *${prefix}help <folder>* to browse by category.`
      ].join('\n').trimEnd();

      // Send message with buttons using gifted-btns
      await sendButtons(sock, extra.from, {
        title: '',
        text: menu,
        footer: `> *Powered by ${config.botName}*`,
        buttons: [
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: 'Youtube',
              url: config.social?.youtube || 'https://youtube.com/yourchannel'
            })
          },
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({
              display_text: 'Visit Bot Repo',
              url: config.social?.github || 'https://github.com/yourusername'
            })
          },
        ]
      }, { quoted: msg });
    } catch (err) {
      console.error('list.js error:', err);
      await extra.reply('❌ Failed to load commands list.');
    }
  }
};
