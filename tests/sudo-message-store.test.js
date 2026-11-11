const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sessionName = `session-sudo-test-${process.pid}`;
const sessionPath = path.join(root, sessionName);
const statePath = path.join(root, 'database', `sudo-test-${process.pid}.json`);
const pnUser = '2348012345678';
const lidUser = '12345678901234';
const taggedUser = '2348098765432';

process.env.SUDO_DB_FILE = statePath;
fs.writeFileSync(statePath, JSON.stringify({ sudoUsers: [`@${pnUser}`] }));

const config = require('../config');
config.sessionName = sessionName;
const database = require('../database');
const store = require('../utils/messageStore');
const sudoCommand = require('../commands/owner/sudo');

async function run() {
try {
  fs.mkdirSync(sessionPath, { recursive: true });
  fs.writeFileSync(
    path.join(sessionPath, `lid-mapping-${pnUser}.json`),
    JSON.stringify(lidUser)
  );
  fs.writeFileSync(
    path.join(sessionPath, `lid-mapping-${lidUser}_reverse.json`),
    JSON.stringify(pnUser)
  );

  assert.deepEqual(database.getSudoUsers(), [`${pnUser}@s.whatsapp.net`]);
  assert.equal(database.isSudoUser(`${pnUser}@s.whatsapp.net`), true);

  const commandMessage = {
    key: { remoteJid: 'owner@s.whatsapp.net' },
    message: {
      extendedTextMessage: {
        text: `.sudo add @${taggedUser}`,
        contextInfo: { mentionedJid: [`${taggedUser}@s.whatsapp.net`] }
      }
    }
  };
  await sudoCommand.execute({
    sendMessage: async () => {}
  }, commandMessage, ['add', `@${taggedUser}`], {
    from: 'owner@s.whatsapp.net',
    isGroup: false,
    reply: async (text) => { throw new Error(`Unexpected command error: ${text}`); }
  });
  assert.equal(database.isSudoUser(`${taggedUser}@s.whatsapp.net`), true);

  assert.equal(database.addSudoUser(`${pnUser}@s.whatsapp.net`), false);
  assert.equal(database.isSudoUser(`${pnUser}:4@s.whatsapp.net`), true);
  assert.equal(database.isSudoUser(pnUser), true);
  assert.equal(database.isSudoUser(`${lidUser}@lid`), true);
  assert.equal(database.isSudoUser('234801234567@s.whatsapp.net'), false);

  assert.equal(database.getSudoAllowedCommands(), null);
  assert.equal(database.canSudoUseCommand('ping'), true);
  database.setSudoAllowedCommands(['menu', 'ping', 'menu']);
  assert.deepEqual(database.getSudoAllowedCommands(), ['menu', 'ping']);
  assert.equal(database.canSudoUseCommand('ping'), true);
  assert.equal(database.canSudoUseCommand('kick'), false);
  database.setSudoAllowedCommands(null);
  assert.equal(database.canSudoUseCommand('kick'), true);

  store.messages.clear();
  const listeners = new Map();
  store.bind({ on: (event, listener) => listeners.set(event, listener) });
  const cachedMessage = {
    key: { remoteJid: 'chat@g.us', id: 'message-1' },
    message: { conversation: 'cached content' }
  };
  listeners.get('messages.upsert')({ messages: [cachedMessage] });
  const loaded = await store.loadMessage('chat@g.us', 'message-1');
  assert.deepEqual(loaded.message, { conversation: 'cached content' });

  for (let i = 0; i < store.maxPerChat + 1; i++) {
    store.add({ key: { remoteJid: 'bounded@g.us', id: `m${i}` }, message: {} });
  }
  assert.equal(store.messages.get('bounded@g.us').size, store.maxPerChat);
  for (let i = 0; i < store.maxChats + 1; i++) {
    store.add({ key: { remoteJid: `chat-${i}@g.us`, id: 'm1' }, message: {} });
  }
  assert.equal(store.messages.size, store.maxChats);

  database.flushAll();
  console.log('Sudo permission and Baileys message-store tests passed.');
} finally {
  store.messages.clear();
  fs.rmSync(statePath, { force: true });
  fs.rmSync(sessionPath, { recursive: true, force: true });
}
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
