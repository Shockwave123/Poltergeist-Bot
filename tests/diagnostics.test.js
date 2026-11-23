const assert = require('node:assert/strict');

const ping = require('../commands/general/ping');
const health = require('../commands/owner/health');
const stats = require('../commands/owner/stats');
const uptime = require('../commands/general/uptime');

const runtimeStats = {
  uptimeSeconds: 321,
  connected: true,
  linked: true,
  status: 'Connected with the saved session.',
  reconnects: 2,
  reconnectAttempts: 3,
  failedProbes: 0,
  lastDisconnectReason: '515',
  lastSocketError: 'isolated test error',
  authMethod: 'session-file',
  lastServerTrafficAgeSeconds: 6,
  totalMessagesSeen: 42,
  messageStoreChats: 7,
  memoryLimitMb: 420,
  memoryMb: 128,
  heapUsedMb: 32,
  heapTotalMb: 80,
  externalMb: 3,
  qrCount: 4,
  qrAgeSeconds: 5,
  nodeVersion: 'v20.0.0',
  platform: 'win32/x64'
};

async function run() {
  const pingReplies = [];
  const pingEdits = [];
  const sock = {
    user: { id: 'private-test-user' },
    getConnectionStats: () => runtimeStats,
    sendMessage: async (chatId, payload) => {
      pingEdits.push({ chatId, payload });
      return { key: { id: 'edited-ping' } };
    }
  };
  await ping.execute(sock, {}, [], {
    from: 'test-chat',
    reply: async (text) => {
      pingReplies.push(text);
      return { key: { id: 'ping-message' } };
    }
  });
  assert.deepEqual(pingReplies, ['🏓 Pinging...']);
  assert.equal(pingEdits.length, 1);
  assert.equal(pingEdits[0].payload.edit.id, 'ping-message');
  assert.match(pingEdits[0].payload.text, /Send response:\* \d+ ms/);
  assert.match(pingEdits[0].payload.text, /WhatsApp:\* Connected/);
  assert.match(pingEdits[0].payload.text, /Reconnects:\* 2/);
  assert.match(pingEdits[0].payload.text, /RAM:.*\/ 420 MB/);

  const healthReplies = [];
  await health.execute(sock, {}, [], {
    reply: async (text) => healthReplies.push(text)
  });
  assert.match(healthReplies[0], /Overall:\* HEALTHY/);
  assert.match(healthReplies[0], /Runtime telemetry: full/);
  assert.match(healthReplies[0], /Last socket error: isolated test error/);
  assert.match(healthReplies[0], /Messages seen: 42/);
  assert.match(healthReplies[0], /Node\.js: v20\.0\.0/);

  const statsReplies = [];
  await stats.execute(sock, {}, [], {
    reply: async (text) => statsReplies.push(text)
  });
  assert.match(statsReplies[0], /Connected.*linked/);
  assert.match(statsReplies[0], /Last close: 515/);
  assert.match(statsReplies[0], /Msg store \(chats\):  7/);

  const uptimeReplies = [];
  await uptime.execute(sock, {}, [], {
    reply: async (text) => uptimeReplies.push(text)
  });
  assert.match(uptimeReplies[0], /Uptime:\* 5 minutes, 21 seconds/);
  assert.match(uptimeReplies[0], /WhatsApp:\* Connected/);
  assert.match(uptimeReplies[0], /Reconnects:\* 2/);

  const localHealthReplies = [];
  await health.execute({ ws: { isOpen: false } }, {}, [], {
    reply: async (text) => localHealthReplies.push(text)
  });
  assert.match(localHealthReplies[0], /Runtime telemetry: local-only/);

  console.log('Ping, health, stats, and uptime diagnostic tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
