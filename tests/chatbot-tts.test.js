const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const statePath = path.join(__dirname, '..', 'database', `autochat-test-chatbot-${process.pid}.json`);
process.env.AUTOCHAT_STATE_FILE = statePath;

const autoChat = require('../utils/autoChat');
const { parseTtsInput, resolveVoice, VOICE_PRESETS } = require('../utils/tts');

try {
  autoChat.recordMessage('chat@test', 'What is my plan?');
  autoChat.recordBotReply('chat@test', 'You planned to finish the report.');
  autoChat.recordMessage('chat@test', 'What did I say I would finish?');

  assert.deepEqual(autoChat.getRecentConversation('chat@test'), [
    { role: 'user', text: 'What is my plan?' },
    { role: 'assistant', text: 'You planned to finish the report.' },
    { role: 'user', text: 'What did I say I would finish?' }
  ]);
  assert.deepEqual(autoChat.getRecentMessages('chat@test'), [
    'What is my plan?',
    'What did I say I would finish?'
  ]);

  const parsedVoice = parseTtsInput(['guy', 'Hello', 'there']);
  assert.deepEqual(parsedVoice, { lang: 'en', voice: 'guy', text: 'Hello there' });
  assert.equal(resolveVoice('guy').voice, 'en-US-GuyNeural');
  assert.equal(resolveVoice('', 'hi').voice, 'hi-IN-SwaraNeural');
  assert.ok(VOICE_PRESETS.aria && VOICE_PRESETS.swara);

  console.log('Chat context and neural TTS tests passed.');
} finally {
  fs.rmSync(statePath, { force: true });
}
