/**
 * Kick Command
 * Remove mentioned or replied users from the group
 * Includes robust self-kick prevention for PN/LID IDs
 */

const { findParticipant } = require('../../utils/jidHelper');

module.exports = {
  name: 'kick',
  aliases: ['remove'],
  category: 'admin',
  description: 'Kick mentioned/replied members from the group',
  usage: '.kick @user',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,
  
  async execute(sock, msg, args, extra) {
    try {
      const chatId = extra.from;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      let usersToKick = [];
      
      if (mentioned && mentioned.length > 0) {
        usersToKick = mentioned;
      } else if (ctx?.participant && ctx.stanzaId && ctx.quotedMessage) {
        usersToKick = [ctx.participant];
      }
      
      if (usersToKick.length === 0) {
        return extra.reply('👤 Mention or reply to the user you want to kick.');
      }
      
      const metadata = await sock.groupMetadata(chatId);
      const participants = metadata?.participants || [];
      const targetParticipants = usersToKick.map((userId) =>
        findParticipant(participants, userId)
      );
      if (targetParticipants.some((participant) => !participant)) {
        return extra.reply('❌ One or more mentioned/replied users could not be found in this group.');
      }
      const uniqueTargetParticipants = [...new Set(targetParticipants)];

      const botParticipant = findParticipant(
        participants,
        [sock.user?.id, sock.user?.lid].filter(Boolean)
      );
      if (botParticipant && uniqueTargetParticipants.includes(botParticipant)) {
        await extra.reply('❌ Cannot kick myself!');
        return;
      }

      const participantJids = [...new Set(uniqueTargetParticipants.map((participant) =>
        participant.id || participant.jid || participant.userJid || participant.lid
      ).filter(Boolean))];
      if (participantJids.length !== uniqueTargetParticipants.length) {
        return extra.reply('❌ Could not resolve a group JID for every user to kick.');
      }

      const results = await sock.groupParticipantsUpdate(chatId, participantJids, 'remove');
      const failures = participantJids.map((jid) => ({
        jid,
        result: Array.isArray(results) ? results.find((entry) => entry.jid === jid) : null
      })).filter(({ result }) => !result || String(result.status) !== '200');
      if (failures.length) {
        const details = failures.map(({ jid, result }) =>
          `@${jid.split('@')[0]}${result?.status ? ` (status ${result.status})` : ''}`
        );
        return extra.reply(
          `❌ WhatsApp refused to remove: ${details.join(', ')}. Make sure the bot is an admin and the target can be removed.`
        );
      }

      const usernames = participantJids.map((jid) => `@${jid.split('@')[0]}`);
      const text = `✅ ${usernames.join(', ')} has been kicked successfully.`;

      await sock.sendMessage(extra.from, { text, mentions: participantJids }, { quoted: msg });
    } catch (error) {
      console.error('Kick command error:', error);
      await extra.reply(
        `❌ Failed to kick user(s): ${error.message || 'Unknown error'}. Make sure I am admin and the target can be removed.`
      );
    }
  },
};
