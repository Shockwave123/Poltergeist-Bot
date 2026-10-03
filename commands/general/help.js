/**
 * Help Command - Display command descriptions and usage
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');
const { getFolderDetails, groupCommands } = require('../../utils/commandPresentation');

const permissionLabels = [
  ['ownerOnly', 'Owner only'],
  ['adminOnly', 'Group admins only'],
  ['modOnly', 'Moderators only'],
  ['groupOnly', 'Groups only'],
  ['privateOnly', 'Private chat only'],
  ['botAdminNeeded', 'Bot must be admin']
];
const shorten = (value, maxLength = 96) => {
  const text = String(value || 'No description available').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
};

const formatUsage = (command) => {
  const usage = String(command.usage || command.name).trim();
  return /^[^\p{L}\p{N}\s]/u.test(usage) ? usage : `${config.prefix}${usage}`;
};
const PAGE_SIZE = 10;

module.exports = {
  name: 'help',
  aliases: [],
  category: 'general',
  description: 'Browse commands by folder or view a command guide',
  usage: '.help [folder [page]|command]',

  async execute(sock, msg, args, extra) {
    try {
      const commands = loadCommands();
      const groups = groupCommands(commands);
      const queryParts = args.map((part) => String(part).trim()).filter(Boolean);
      const mode = queryParts[0]?.toLowerCase();
      const forcedMode = ['folder', 'command'].includes(mode) ? mode : '';
      const searchParts = forcedMode ? queryParts.slice(1) : queryParts;
      const candidateFolder = searchParts[0]?.toLowerCase();
      const group = forcedMode === 'command' ? null : groups.find((entry) => entry.folder === candidateFolder);
      const page = group ? Math.max(1, Number.parseInt(searchParts[1], 10) || 1) : 1;
      const query = (forcedMode === 'command' ? searchParts : (group ? [] : searchParts))
        .join(' ').replace(/^\./, '').toLowerCase();

      if (!query && !group) {
        const commandCount = groups.reduce((total, entry) => total + entry.commands.length, 0);
        const lines = [
          `╭─ *${config.botName} HELP* ─╮`,
          `Prefix: *${config.prefix}*  ·  *${commandCount} commands*`,
          '',
          '*COMMAND FOLDERS*',
          ...groups.map((entry) => `${entry.icon} *${entry.label}*  ·  ${entry.commands.length}`),
          '',
          `Browse a folder: *${config.prefix}help <folder> [page]*`,
          `View one command: *${config.prefix}help <command>*`,
          `Example: *${config.prefix}help ai* or *${config.prefix}help .ping*`
        ];
        return extra.reply(lines.join('\n'));
      }

      if (group && forcedMode !== 'command') {
        const pageCount = Math.max(1, Math.ceil(group.commands.length / PAGE_SIZE));
        const shownPage = Math.min(page, pageCount);
        const pageCommands = group.commands.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE);
        const lines = [
          `╭─ ${group.icon} *${group.label} COMMANDS* ─╮`,
          `${group.commands.length} commands  ·  page ${shownPage}/${pageCount}`,
          '',
          ...pageCommands.flatMap((command) => [
            `• *${config.prefix}${command.name}* — ${shorten(command.description || command.desc)}`,
            `  Example: *${formatUsage(command)}*`
          ]),
          '',
          pageCount > 1 ? `Next: *${config.prefix}help ${group.folder} ${Math.min(shownPage + 1, pageCount)}*` : '',
          `For aliases and access details: *${config.prefix}help <command>*`
        ];
        return extra.reply(lines.filter(Boolean).join('\n'));
      }

      const command = commands.get(query);
      if (!command) {
        const folders = groups.map((entry) => entry.folder).join(', ');
        return extra.reply(`I couldn't find *${query}*. Try a command name or one of these folders:\n${folders}`);
      }

      const folder = String(command.folder || command.category || 'other').toLowerCase();
      const folderDetails = getFolderDetails(folder);
      const permissions = permissionLabels
        .filter(([property]) => command[property])
        .map(([, label]) => label);
      const lines = [
        `╭─ ${folderDetails.icon} *${folderDetails.label} · ${config.prefix}${command.name}* ─╮`,
        shorten(command.description || command.desc, 180),
        '',
        `Usage: *${formatUsage(command)}*`
      ];
      if (command.aliases?.length) lines.push(`Aliases: ${command.aliases.map((alias) => `${config.prefix}${alias}`).join(', ')}`);
      if (permissions.length) lines.push(`Access: ${permissions.join(' · ')}`);
      lines.push('', `More in this folder: *${config.prefix}help ${folder}*`);
      return extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('help.js error:', error);
      await extra.reply(`❌ Failed to load help: ${error.message}`);
    }
  }
};
