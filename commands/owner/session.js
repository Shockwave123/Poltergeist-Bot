/**
 * Session Command - Send the bot's session id to the owner in private chat.
 *
 * The session id is the login credential for the linked WhatsApp account, so this
 * command is owner-only AND private-chat-only, and the message is deleted from the
 * chat after a short delay when the platform allows it.
 */

const config = require('../../config');
const sessionManager = require('../../utils/sessionManager');

const numberFromJid = (jid) => String(jid || '').split(':')[0].split('@')[0];

module.exports = {
  name: 'session',
  aliases: ['sessionid', 'getsession', 'mysession', 'sessionstring'],
  category: 'owner',
  description: 'Get this deployment\'s session id (owner only, private chat)',
  usage: '.sessionid | .sessionid file | .sessionid info | .sessionid export',
  ownerOnly: true,
  privateOnly: true,

  async execute(sock, msg, args, extra) {
    const action = (args[0] || '').toLowerCase();
    const prefix = extra.prefix || '.';

    try {
      const state = sessionManager.getState();
      const status = sessionManager.getStatus();

      // Status only - never leaks the credential
      if (action === 'info' || action === 'status') {
        return extra.reply([
          '╭───『 🔑 *SESSION STATUS* 』───',
          '│',
          `│ Stored session: ${status.hasSession ? '✅ yes' : '❌ no'}`,
          `│ creds.json on disk: ${status.credsOnDisk ? '✅ yes' : '❌ no'}`,
          `│ Link method: *${status.authMethod}*`,
          `│ Linked number: ${state.phoneNumber || 'unknown'}`,
          `│ Linked at: ${state.linkedAt ? new Date(state.linkedAt).toLocaleString() : 'unknown'}`,
          `│ Preview: ${status.sessionPreview}`,
          `│ Welcome sent: ${status.welcomeSent ? '✅' : '⏳'}`,
          '│',
          `│ • \`${prefix}sessionid\` - receive the full session id`,
          `│ • \`${prefix}sessionid file\` - receive it as a .txt file`,
          `│ • \`${prefix}sessionid export\` - rebuild it from creds.json`,
          '╰──────────────────────────────'
        ].join('\n'));
      }

      let sessionId = sessionManager.getSessionId();

      // Rebuild from the credentials currently on disk
      if (action === 'export' || action === 'refresh') {
        const exported = sessionManager.exportSessionFromDisk();
        if (!exported) {
          return extra.reply('❌ No credentials found on disk yet. Link the bot first (QR or pairing code).');
        }
        sessionManager.setSessionId(exported, {
          authMethod: sessionManager.getState().authMethod || 'session-file',
          phoneNumber: numberFromJid(sock.user?.id)
        });
        sessionId = exported;
        await extra.reply(`♻️ Session id rebuilt from creds.json (${sessionId.length} chars).`);
      }

      if (!sessionId) {
        const exported = sessionManager.exportSessionFromDisk();
        if (exported) {
          sessionManager.setSessionId(exported, { authMethod: 'session-file', phoneNumber: numberFromJid(sock.user?.id) });
          sessionId = exported;
        }
      }

      if (!sessionId) {
        return extra.reply(
          '❌ No session id is stored yet.\n\n' +
          'Link the bot with a QR code or pairing code and the session id will be generated automatically.'
        );
      }

      const header = [
        '🔐 *SESSION ID* (keep this private)',
        '',
        `Linked number: ${numberFromJid(sock.user?.id) || 'unknown'}`,
        `Length: ${sessionId.length} characters`,
        '',
        'This string can log in as this WhatsApp account. Anyone who has it controls the account.',
        'Store it in a password manager, then set it as the SESSION_ID environment variable so the bot stays linked after restarts.',
        ''
      ].join('\n');

      // Always offer a copy-paste friendly file too
      try {
        await sock.sendMessage(extra.from, {
          document: Buffer.from(sessionId, 'utf8'),
          mimetype: 'text/plain',
          fileName: 'PoltergeistMD-session.txt',
          caption: '🗂️ Session id backup file. Store it somewhere private.'
        });
      } catch (error) {
        console.error('[session] file send failed:', error?.message || error);
      }

      if (action === 'file' || action === 'download') {
        return extra.reply('📂 Session id sent as a .txt file. Keep it private!');
      }

      // Split into safe chunks in case WhatsApp rejects very long single messages
      const chunkSize = 1200;
      if (sessionId.length <= chunkSize) {
        return extra.reply(`${header}\n\`\`\`\n${sessionId}\n\`\`\`\n\n⚠️ Delete this chat once you have saved it.`);
      }

      await extra.reply(header);
      for (let index = 0; index < sessionId.length; index += chunkSize) {
        const part = sessionId.slice(index, index + chunkSize);
        const partNumber = Math.floor(index / chunkSize) + 1;
        const totalParts = Math.ceil(sessionId.length / chunkSize);
        await sock.sendMessage(extra.from, { text: `Part ${partNumber}/${totalParts}:\n\`\`\`\n${part}\n\`\`\`` });
      }
      return extra.reply('⚠️ Join the parts above into one string, then delete this chat.');
    } catch (error) {
      console.error('[session] failed:', error);
      return extra.reply(`❌ Could not read the session id: ${error.message}`);
    }
  }
};
