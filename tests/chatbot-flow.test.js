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
const chatbotCommand = require('../commands/admin/chatbot');
const autoChatCommand = require('../commands/owner/autochat');
const database = require('../database');

async function run() {
  const requestedModels = [];
  const prompts = [];
  const sentMessages = [];
  const groupSettings = new Map();
  const originalGetGroupSettings = database.getGroupSettings;
  const originalUpdateGroupSettings = database.updateGroupSettings;
  axios.post = async (url, payload) => {
    requestedModels.push(String(url));
    prompts.push(payload.contents[0].parts[0].text);
    return {
      data: {
        candidates: [{ content: { parts: [{ text: 'Hey there!' }] } }]
      }
    };
  };
  database.getGroupSettings = (chatId) => groupSettings.get(chatId) || { chatbotPersonality: 'default' };
  database.updateGroupSettings = (chatId, settings) => {
    groupSettings.set(chatId, { ...(groupSettings.get(chatId) || {}), ...settings });
    return true;
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
    assert.ok(!prompts[0].includes('Personality:'));
    assert.deepEqual(sentMessages.map(([chatId, message, options]) => ({
      chatId,
      message,
      options
    })), [
      { chatId: 'chatbot-test@g.us', message: { text: 'Hey there!' }, options: undefined },
      { chatId: 'autochat-test@g.us', message: { text: 'Hey there!' }, options: undefined }
    ]);

    const reply = async () => {};
    await chatbotCommand.execute(sock, {}, ['personality', 'Overthinker'], {
      from: 'persona-test@g.us',
      isAdmin: true,
      reply
    });
    assert.equal(groupSettings.get('persona-test@g.us').chatbotPersonality, 'overthinker');
    await handleChat(sock, {
      key: { remoteJid: 'persona-test@g.us', participant: 'user@s.whatsapp.net' }
    }, 'hello', 'user@s.whatsapp.net');
    assert.ok(prompts[2].includes('Personality: Be an overthinker'));

    await chatbotCommand.execute(sock, {}, ['personality', 'cycle'], {
      from: 'cycle-test@g.us',
      isAdmin: true,
      reply
    });
    assert.equal(groupSettings.get('cycle-test@g.us').chatbotPersonality, 'cycle');
    for (let index = 0; index < 11; index++) {
      await handleContinuousChat(sock, {
        key: { remoteJid: 'cycle-test@g.us', participant: 'user@s.whatsapp.net' }
      }, `cycle ${index}`, 'cycle-test@g.us');
    }
    const cyclePrompts = prompts.slice(3);
    assert.equal(cyclePrompts.length, 11);
    const expectedPersonalityPrompts = [
      null,
      'unbothered, dry, low-energy',
      'indecisive and visibly consider multiple sides',
      'an overthinker who notices tiny details',
      'a playful contrarian who tests the user’s reasoning',
      'impulsive and hype-first about harmless',
      'a blunt, zero-filter truth-teller',
      'sentimental and reflective',
      'suspicious, dramatic, playful tone',
      'a relatable last-minute hustler',
      'jaded, sarcastic, and tired of everyone'
    ];
    expectedPersonalityPrompts.forEach((expected, index) => {
      if (expected) assert.ok(cyclePrompts[index].includes(expected));
      else assert.ok(!cyclePrompts[index].includes('Personality:'));
    });

    await autoChatCommand.execute(sock, {}, ['personality', 'Nonchalant Friend'], {
      from: 'autochat-personality-owner@g.us',
      reply
    });
    assert.equal(autoChat.getPersonality(), 'nonchalant');
    assert.equal(autoChat.getActiveChat(), null);

    await autoChatCommand.execute(sock, {}, ['on'], {
      from: 'autochat-personality-test@g.us',
      reply
    });
    assert.equal(autoChat.getActiveChat(), 'autochat-personality-test@g.us');
    await handleContinuousChat(sock, {
      key: { remoteJid: 'autochat-personality-test@g.us', participant: 'user@s.whatsapp.net' }
    }, 'hello', 'autochat-personality-test@g.us');
    assert.ok(prompts.at(-1).includes('Personality: Be an unbothered, dry, low-energy friend'));

    let autoChatConfirmation = '';
    await autoChatCommand.execute(sock, {}, ['personality', 'cycle'], {
      from: 'autochat-personality-owner@g.us',
      reply: async (text) => { autoChatConfirmation = text; }
    });
    assert.match(autoChatConfirmation, /Use `\.autochat on`/);
    assert.equal(autoChat.getActiveChat(), 'autochat-personality-test@g.us');

    await new Promise((resolve) => setTimeout(resolve, 300));
    const persistedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(persistedState.conversations['autochat-test@g.us'].at(-1).text, 'Hey there!');

    console.log('Chatbot and auto-chat flow tests passed.');
  } finally {
    axios.post = originalPost;
    database.getGroupSettings = originalGetGroupSettings;
    database.updateGroupSettings = originalUpdateGroupSettings;
    autoChat.disable();
    autoChat.setPersonality(null);
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
