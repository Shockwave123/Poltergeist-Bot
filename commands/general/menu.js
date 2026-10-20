/**
 * Menu Command - Display all available commands
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const packageInfo = require('../../package.json');
const { loadCommands } = require('../../utils/commandLoader');
const { groupCommands } = require('../../utils/commandPresentation');

module.exports = {
  name: 'menu',
  aliases: ['commands', 'menufull'],
  category: 'general',
  description: 'Show all available commands',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const groups = groupCommands(loadCommands());
      const commandCount = groups.reduce((total, group) => total + group.commands.length, 0);
      const divider = '━━━━━━━━━━━━━━━━';
      const folderLines = groups.flatMap((group) => {
        const names = group.commands.map((command) => `${config.prefix}${command.name}`);
        const rows = [];
        for (let index = 0; index < names.length; index += 4) {
          rows.push(`  ${names.slice(index, index + 4).join(' · ')}`);
        }
        return [`${group.icon} *${group.label}* · ${group.commands.length}`, ...rows, ''];
      });

      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';
      const senderName = extra.sender ? extra.sender.split('@')[0] : 'there';

      const menuText = [
        `╭─ *${config.botName}* ─╮`,
        `👋 Hey, @${senderName}!`,
        `🧾 *${commandCount} commands*  ·  prefix *${config.prefix}*`,
        divider,
        ...folderLines,
        divider,
        `💡 *${config.prefix}help <folder>* — browse a category`,
        `🔍 *${config.prefix}help <command>* — command details`,
        `👑 Owner: ${displayOwner}  ·  v${packageInfo.version}`
      ].join('\n');

      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      if (fs.existsSync(imagePath)) {
        await sock.sendMessage(extra.from, {
          image: fs.readFileSync(imagePath),
          caption: menuText,
          mentions: extra.sender ? [extra.sender] : []
        }, { quoted: msg });
      } else {
        await sock.sendMessage(extra.from, {
          text: menuText,
          mentions: extra.sender ? [extra.sender] : []
        }, { quoted: msg });
      }
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  }
};
