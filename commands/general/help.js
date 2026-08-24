/**
 * Help Command - Display command descriptions and usage
 */

const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');

const permissionLabels = [
  ['ownerOnly', 'Owner only'],
  ['adminOnly', 'Group admins only'],
  ['modOnly', 'Moderators only'],
  ['groupOnly', 'Groups only'],
  ['privateOnly', 'Private chat only'],
  ['botAdminNeeded', 'Bot must be admin']
];

module.exports = {
  name: 'help',
  aliases: [],
  category: 'general',
  description: 'Show every command with its description and usage',
  usage: '.help',

  async execute(sock, msg, args, extra) {
    try {
      const uniqueCommands = new Map();
      loadCommands().forEach((command) => uniqueCommands.set(command.name, command));
      const categories = {};

      [...uniqueCommands.values()].forEach((command) => {
        const category = (command.category || 'other').toLowerCase();
        if (!categories[category]) categories[category] = [];
        categories[category].push(command);
      });

      let helpText = `*${config.botName} - Command Help*\n`;
      helpText += `Prefix: *${config.prefix}*\n`;
      helpText += `Total commands: *${uniqueCommands.size}*\n\n`;

      Object.keys(categories).sort().forEach((category) => {
        helpText += `*📂 ${category.toUpperCase()}*\n`;
        categories[category].sort((first, second) => first.name.localeCompare(second.name));
        categories[category].forEach((command) => {
          const usage = command.usage || `${config.prefix}${command.name}`;
          const aliases = command.aliases?.length ? ` | Aliases: ${command.aliases.join(', ')}` : '';
          const permissions = permissionLabels
            .filter(([property]) => command[property])
            .map(([, label]) => label)
            .join(', ');
          const access = permissions ? ` | ${permissions}` : '';
          const formattedUsage = usage.startsWith(config.prefix)
            ? usage
            : `${config.prefix}${usage}`;

          helpText += `• *${config.prefix}${command.name}* - ${command.description || 'No description available'}\n`;
          helpText += `  Usage: \`${formattedUsage}\`${aliases}${access}\n`;
        });
        helpText += '\n';
      });

      await extra.reply(helpText.trim());
    } catch (error) {
      console.error('help.js error:', error);
      await extra.reply(`❌ Failed to load help: ${error.message}`);
    }
  }
};
