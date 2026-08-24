/**
 * Menu Command - Display all available commands
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const { loadCommands } = require('../../utils/commandLoader');

const categoryLabels = {
  general: '🧭 GENERAL',
  ai: '🤖 AI',
  anime: '👾 ANIME',
  admin: '🛡️ ADMIN',
  owner: '👑 OWNER',
  media: '🎞️ MEDIA',
  fun: '🎭 FUN',
  economy: '💰 ECONOMY',
  utility: '🔧 UTILITY',
  textmaker: '🖋️ TEXTMAKER'
};

const getUniqueCommands = (commands) => {
  const uniqueCommands = new Map();
  commands.forEach((command) => uniqueCommands.set(command.name, command));
  return [...uniqueCommands.values()];
};

module.exports = {
  name: 'menu',
  aliases: ['commands'],
  category: 'general',
  description: 'Show all available commands',
  usage: '.menu',

  async execute(sock, msg, args, extra) {
    try {
      const commands = getUniqueCommands(loadCommands());
      const categories = {};

      commands.forEach((command) => {
        const category = (command.category || 'other').toLowerCase();
        if (!categories[category]) categories[category] = [];
        categories[category].push(command);
      });

      const ownerNames = Array.isArray(config.ownerName) ? config.ownerName : [config.ownerName];
      const displayOwner = ownerNames[0] || config.ownerName || 'Bot Owner';
      const senderName = extra.sender ? extra.sender.split('@')[0] : 'there';

      let menuText = `╭━━『 *${config.botName}* 』━━╮\n\n`;
      menuText += `👋 Hello @${senderName}!\n\n`;
      menuText += `⚡ Prefix: ${config.prefix}\n`;
      menuText += `📦 Total Commands: ${commands.length}\n`;
      menuText += `👑 Owner: ${displayOwner}\n\n`;

      Object.keys(categories).sort().forEach((category) => {
        const label = categoryLabels[category] || `📂 ${category.toUpperCase()}`;
        menuText += `┏━━━━━━━━━━━━━━━━━\n`;
        menuText += `┃ ${label} COMMANDS\n`;
        menuText += `┗━━━━━━━━━━━━━━━━━\n`;
        categories[category].sort((first, second) => first.name.localeCompare(second.name));
        categories[category].forEach((command) => {
          const aliases = command.aliases?.length ? ` (${command.aliases.join(', ')})` : '';
          menuText += `│ ➜ ${config.prefix}${command.name}${aliases}\n`;
        });
        menuText += '\n';
      });

      menuText += `╰━━━━━━━━━━━━━━━━━\n\n`;
      menuText += `💡 Type ${config.prefix}help for command descriptions and usage.\n`;
      menuText += `🌟 Bot Version: 1.0.3\n`;

      const imagePath = path.join(__dirname, '../../utils/bot_image.jpg');
      if (fs.existsSync(imagePath)) {
        await sock.sendMessage(extra.from, {
          image: fs.readFileSync(imagePath),
          caption: menuText,
          mentions: extra.sender ? [extra.sender] : [],
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: config.newsletterJid || '120363161513685998@newsletter',
              newsletterName: config.botName,
              serverMessageId: -1
            }
          }
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
