const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');

const statePath = path.join(__dirname, '..', 'database', `autochat-flow-test-${process.pid}.json`);
const previousApiKey = process.env.GEMINI_API_KEY;
const previousStatePath = process.env.AUTOCHAT_STATE_FILE;
const originalPost = axios.post;

process.env.GEMINI_API_KEY = 'test-gemini-api-key-for-chatbot';
process.env.AUTOCHAT_STATE_FILE = statePath;

const { handleChat, handleContinuousChat } = require('../commands/admin/chatbot');
const autoChat = require('../utils/autoChat');

async function run() {
  const requestedModels = [];
  const sentMessages = [];
  axios.post = async (url) => {
    requestedModels.push(String(url));
    return {
      data: {
        candidates: [{ content: { parts: [{ text: 'Hey there!' }] } }]
      }
    };
  };

  const sock = {
    sendPresenceUpdate: async () => {},
    sendMessage: async (...args) => sentMessages.push(args)
  };

  try {
    await handleChat(sock, {
      key: { remoteJid: 'chatbot-test@g.us', participant: 'user@s.whatsapp.net' }
    }, 'hello', 'user@s.whatsapp.net');

    await handleContinuousChat(sock, {
      key: { remoteJid: 'autochat-test@g.us', participant: 'user@s.whatsapp.net' }
    }, 'hello', 'autochat-test@g.us');

    assert.equal(requestedModels.length, 2);
    assert.ok(requestedModels[0].includes('/models/gemini-3.8-flash:generateContent'));
    assert.deepEqual(sentMessages.map(([chatId, message, options]) => ({
      chatId,
      message,
      options
    })), [
      { chatId: 'chatbot-test@g.us', message: { text: 'Hey there!' }, options: undefined },
      { chatId: 'autochat-test@g.us', message: { text: 'Hey there!' }, options: undefined }
    ]);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const persistedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(persistedState.conversations['autochat-test@g.us'].at(-1).text, 'Hey there!');

    console.log('Chatbot and auto-chat flow tests passed.');
  } finally {
    axios.post = originalPost;
    autoChat.disable();
    fs.rmSync(statePath, { force: true });
    if (previousApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousApiKey;
    if (previousStatePath === undefined) delete process.env.AUTOCHAT_STATE_FILE;
    else process.env.AUTOCHAT_STATE_FILE = previousStatePath;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
