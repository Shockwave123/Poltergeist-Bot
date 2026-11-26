/**
 * Antibadword Command - Detect and delete bad words (delete/kick/warn)
 */

const database = require('../../database');
const baileys = require('@whiskeysockets/baileys');
const { normalizeBadWord } = require('../../utils/badwords');

const MAX_CUSTOM_STICKER_BYTES = 1024 * 1024;

function unwrapMessage(message) {
  let content = message || {};
  for (let depth = 0; depth < 5; depth += 1) {
    const inner = content.ephemeralMessage?.message
      || content.viewOnceMessage?.message
      || content.viewOnceMessageV2?.message
      || content.viewOnceMessageV2Extension?.message
      || content.documentWithCaptionMessage?.message;
    if (!inner) break;
    content = inner;
  }
  return content;
}

async function configureSticker(sock, msg, args, extra, downloadMediaMessage = baileys.downloadMediaMessage) {
  if ((args[1] || '').toLowerCase() === 'reset') {
    database.updateGroupSettings(extra.from, { antibadwordSticker: null });
    return extra.reply('*Antibadword sticker reset to the default.*');
  }

  const current = unwrapMessage(msg.message);
  const contextInfo = current.extendedTextMessage?.contextInfo
    || current.imageMessage?.contextInfo
    || current.videoMessage?.contextInfo;
  const quotedMessage = contextInfo?.quotedMessage;
  const quotedContent = unwrapMessage(quotedMessage);
  if (!quotedMessage || !contextInfo?.stanzaId || !quotedContent.stickerMessage) {
    return extra.reply('*Reply to a sticker with `.antibadword sticker` to set it, or use `.antibadword sticker reset`.*');
  }

  const sticker = await downloadMediaMessage(
    {
      key: {
        remoteJid: extra.from,
        id: contextInfo.stanzaId,
        participant: contextInfo.participant
      },
      message: quotedMessage
    },
    'buffer',
    {},
    { logger: undefined, reuploadRequest: sock.updateMediaMessage }
  );
  if (!sticker?.length) throw new Error('The replied sticker could not be downloaded.');
  if (sticker.length > MAX_CUSTOM_STICKER_BYTES) {
    return extra.reply('*That sticker is too large. Choose one smaller than 1 MB.*');
  }
  database.updateGroupSettings(extra.from, { antibadwordSticker: sticker.toString('base64') });
  return extra.reply('*Custom antibadword sticker saved for this group.*');
}

module.exports = {
  name: 'antibadword',
  aliases: ['antibad', 'nobadword'],
  category: 'admin',
  description: 'Configure antibadword protection (delete/kick/warn)',
  usage: '.antibadword <on/off/set/add/remove/list/sticker>',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  configureSticker,

  async execute(sock, msg, args, extra) {
    try {
      if (!args[0]) {
        const settings = database.getGroupSettings(extra.from);
        const status = settings.antibadword ? 'ON' : 'OFF';
        const action = settings.antibadwordAction || 'delete';
        const words = Array.isArray(settings.antibadwordWords) ? settings.antibadwordWords : [];
        const customSticker = typeof settings.antibadwordSticker === 'string' && settings.antibadwordSticker.length > 0;
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
          `  .antibadword sticker (reply to a sticker)\n` +
          `  .antibadword sticker reset\n` +
          `  .antibadword get\n\n` +
          `Custom words: ${words.length}\n` +
          `Custom sticker: ${customSticker ? '✅' : '❌'}`
        );
      }

      const opt = args[0].toLowerCase();
      const settings = database.getGroupSettings(extra.from);
      const words = Array.isArray(settings.antibadwordWords) ? settings.antibadwordWords : [];

      if (opt === 'sticker') {
        return await configureSticker(sock, msg, args, extra);
      }

      if (opt === 'add' || opt === 'remove') {
        const word = normalizeBadWord(args.slice(1).join(' '));
        if (!word) {
          return extra.reply(`*Usage: .antibadword ${opt} <word or phrase>*`);
        }
        if (word.split(' ').length === 1 && [...word].length < 2) {
          return extra.reply('*Please use a bad word or phrase with at least two characters.*');
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
        const customSticker = typeof settings.antibadwordSticker === 'string' && settings.antibadwordSticker.length > 0;
        return extra.reply(`*Antibadword Configuration:*\nStatus: ${status}\nAction: ${action}\nCustom sticker: ${customSticker ? 'Yes' : 'No'}`);
      }

      return extra.reply('*Use .antibadword for usage.*');
    } catch (error) {
      await extra.reply(`❌ Error: ${error.message}`);
    }
  },
};
