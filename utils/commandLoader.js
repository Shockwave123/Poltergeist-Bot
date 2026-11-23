/**
 * Command Loader - Separate module to avoid circular dependencies
 */

const fs = require('fs');
const path = require('path');

// Cached command registry (see loadCommands)
let cachedCommands = null;

const DISABLED_LEGACY_COMMANDS = {
  'downloaders/android1.js': 'the bundled api-qasim version no longer provides the apksearch API this command expects',
  'owner/addreply.js': 'its autoreply module and message-handler integration are missing',
  'owner/antidelete.js': 'its storage helper and message-handler integration are missing',
  'owner/areact.js': 'use the maintained autoreact command, which now also accepts .areact',
  'owner/cmdreact.js': 'its reactions helper and command-handler integration are missing',
  'stickers/attp.js': 'a maintained .attp command already exists in commands/general',
  'utility/crun.js': 'it executes arbitrary native C++ code on the bot host'
};

function registerCommand(commands, command, label) {
  if (!command) return;

  const name = command.name || command.command;
  if (!name) return;

  if (typeof command.execute !== 'function') {
    if (typeof command.handler !== 'function') {
      throw new Error(`Command "${name}" has no execute or handler function.`);
    }

    command.execute = (sock, message, args, context = {}) => command.handler(
      sock,
      message,
      args,
      {
        ...context,
        chatId: context.chatId || context.from || message?.key?.remoteJid,
        senderId: context.senderId || context.sender,
        channelInfo: context.channelInfo || {}
      }
    );
  }

  command.name = name;
  command.folder = label;
  commands.set(name, command);
  command.aliases?.forEach((alias) => commands.set(alias, command));
}

function registerRegistryCommands(commands, modulePath, label) {
  try {
    const list = require(modulePath);
    for (const cmd of list) {
      registerCommand(commands, cmd, label);
    }
  } catch (error) {
    console.error(`Error loading ${label} commands:`, error.message);
  }
}

function registerFunCommands(commands) {
  registerRegistryCommands(commands, './funCommands', 'fun');
}

function registerDownloaderCommands(commands) {
  registerRegistryCommands(commands, './downloaderCommands', 'downloaders');
}

const loadCommands = (forceRefresh = false) => {
  // Cache the registry: help/menu/list call this on every invocation, and
  // re-scanning the filesystem + rebuilding the Map each time is wasted work
  // in production (Render instances have limited CPU/RAM).
  if (cachedCommands && !forceRefresh) return cachedCommands;

  const commands = new Map();
  const commandsPath = path.join(__dirname, '..', 'commands');
  
  if (!fs.existsSync(commandsPath)) {
    console.log('Commands directory not found');
    return commands;
  }
  
  const categories = fs.readdirSync(commandsPath);
  
  categories.forEach(category => {
    const categoryPath = path.join(commandsPath, category);
    if (fs.statSync(categoryPath).isDirectory()) {
      const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.js'));
      
      files.forEach(file => {
        const commandKey = `${category}/${file}`.toLowerCase();
        const disabledReason = DISABLED_LEGACY_COMMANDS[commandKey];
        if (disabledReason) {
          console.warn(`[commands] Skipped ${commandKey}: ${disabledReason}.`);
          return;
        }

        try {
          const command = require(path.join(categoryPath, file));
          const folder = category.toLowerCase() === 'media' ? 'downloaders' : category.toLowerCase();
          registerCommand(commands, command, folder);
        } catch (error) {
          console.error(`Error loading command ${file}:`, error.message);
        }
      });
    }
  });
  
  registerFunCommands(commands);
  registerDownloaderCommands(commands);
  cachedCommands = commands;
  return commands;
};

module.exports = { loadCommands, registerFunCommands, registerDownloaderCommands };

