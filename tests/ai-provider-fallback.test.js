const assert = require('node:assert/strict');
const axios = require('axios');

const envNames = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEYS',
  'GOOGLE_AI_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_API_KEYS',
  'NVIDIA_NIM_API_KEY',
  'NVIDIA_NIM_API_KEYS',
  'NVIDIA_API_KEY',
  'ZAI_API_KEY',
  'ZAI_API_KEYS',
  'ZHIPUAI_API_KEY',
  'OPENAI_API_KEY',
  'AI_PROVIDER_PRIORITY',
  'TRANSCRIPTION_PROVIDER_PRIORITY'
];
const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const originalPost = axios.post;

function makeWav(seconds = 1) {
  const sampleRate = 16000;
  const dataLength = sampleRate * seconds * 2;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataLength, 40);
  return wav;
}

async function run() {
  for (const name of envNames) delete process.env[name];
  process.env.GEMINI_API_KEY = 'test-gemini-provider-key';
  process.env.NVIDIA_NIM_API_KEY = 'nvapi-test-nvidia-provider-key';
  process.env.ZAI_API_KEY = 'test-zai-provider-api-key';
  process.env.AI_PROVIDER_PRIORITY = 'gemini,nvidia,zai';
  process.env.TRANSCRIPTION_PROVIDER_PRIORITY = 'zai,gemini';

  const requests = [];
  let failNvidia = false;
  axios.post = async (url, payload) => {
    requests.push({ url: String(url), payload });
    if (String(url).includes('generativelanguage.googleapis.com')) {
      const error = new Error('simulated Gemini timeout');
      error.code = 'ECONNABORTED';
      throw error;
    }
    if (String(url).includes('integrate.api.nvidia.com')) {
      if (failNvidia) {
        const error = new Error('simulated NVIDIA outage');
        error.response = { status: 503 };
        throw error;
      }
      return { data: { choices: [{ message: { content: 'NVIDIA fallback answered.' } }] } };
    }
    if (String(url).includes('api.z.ai')) {
      return String(url).includes('/audio/transcriptions')
        ? { data: { text: 'Z.AI transcription succeeded.' } }
        : { data: { choices: [{ message: { content: 'Z.AI fallback answered.' } }] } };
    }
    throw new Error(`Unexpected API request: ${url}`);
  };

  try {
    const { generateContent, resolveAiCredentialChain } = require('../utils/googleAi');
    const chain = resolveAiCredentialChain();
    assert.deepEqual(chain.map(({ provider }) => provider), ['gemini', 'nvidia', 'zai']);

    const nvidiaAnswer = await generateContent([{ text: 'test' }], {
      fast: true,
      timeout: 5000,
      totalTimeout: 10000
    });
    assert.equal(nvidiaAnswer, 'NVIDIA fallback answered.');
    assert.ok(requests[1].url.startsWith('https://integrate.api.nvidia.com/v1/chat/completions'));
    assert.equal(requests[1].payload.model, 'meta/llama-3.3-70b-instruct');

    failNvidia = true;
    const zaiAnswer = await generateContent([{ text: 'test again' }], {
      fast: true,
      timeout: 5000,
      totalTimeout: 10000
    });
    assert.equal(zaiAnswer, 'Z.AI fallback answered.');
    assert.ok(requests.some(({ url }) => url.startsWith('https://api.z.ai/api/paas/v4/chat/completions')));

    const { transcribeAudio } = require('../utils/speechToText');
    const transcript = await transcribeAudio(makeWav(), 'sample.wav', 'audio/wav');
    assert.equal(transcript, 'Z.AI transcription succeeded.');
    assert.ok(requests.some(({ url }) => url === 'https://api.z.ai/api/paas/v4/audio/transcriptions'));

    console.log('AI provider fallback and transcription tests passed.');
  } finally {
    axios.post = originalPost;
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
