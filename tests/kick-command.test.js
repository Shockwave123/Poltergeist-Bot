const assert = require('node:assert/strict');
const kickCommand = require('../commands/admin/kick');

const groupId = 'kick-test@g.us';
const botJid = 'bot@s.whatsapp.net';
const targetJid = 'target@s.whatsapp.net';
const targetLid = 'target@lid';
const participants = [
  { id: botJid, lid: 'bot@lid', admin: 'admin' },
  { id: targetJid, lid: targetLid }
];

function createMessage(mentionedJid) {
  return {
    key: { remoteJid: groupId },
    message: {
      extendedTextMessage: {
        contextInfo: { mentionedJid }
      }
    }
  };
}

async function run() {
  const replies = [];
  const sentMessages = [];
  let participantUpdate;
  const sock = {
    user: { id: botJid, lid: 'bot@lid' },
    groupMetadata: async () => ({ participants }),
    groupParticipantsUpdate: async (...args) => {
      participantUpdate = args;
      return [{ jid: targetJid, status: '200' }];
    },
    sendMessage: async (...args) => sentMessages.push(args)
  };

  await kickCommand.execute(sock, createMessage([targetLid]), [], {
    from: groupId,
    reply: async (text) => replies.push(text)
  });

  assert.deepEqual(participantUpdate, [groupId, [targetJid], 'remove']);
  assert.equal(sentMessages[0][1].mentions[0], targetJid);
  assert.match(sentMessages[0][1].text, /kicked successfully/);
  assert.deepEqual(replies, []);

  sock.groupParticipantsUpdate = async () => [{ jid: targetJid, status: '403' }];
  await kickCommand.execute(sock, createMessage([targetLid]), [], {
    from: groupId,
    reply: async (text) => replies.push(text)
  });
  assert.match(replies.at(-1), /WhatsApp refused to remove/);
  assert.match(replies.at(-1), /status 403/);
  assert.equal(sentMessages.length, 1);

  await kickCommand.execute(sock, createMessage(['bot@lid']), [], {
    from: groupId,
    reply: async (text) => replies.push(text)
  });
  assert.equal(replies.at(-1), '❌ Cannot kick myself!');

  console.log('Kick command LID resolution and refusal handling tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
