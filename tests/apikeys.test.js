const assert = require('node:assert/strict');

const command = require('../commands/owner/apikeys');

async function run() {
  const names = [
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
    'TRANSCRIPTION_PROVIDER_PRIORITY',
    'OPENWEATHER_API_KEY',
    'REMOVEBG_KEY',
    'YOUTUBE_API_KEY',
    'YOUTUBE_API_KEY_WEB',
    'YOUTUBE_API_KEY_ANDROID',
    'YOUTUBE_API_KEY_IOS',
    'YOUTUBE_API_KEY_TV'
  ];
  const previousEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = global.fetch;
  const requests = [];
  const secrets = [
    'test-gemini-secret',
    'test-openrouter-secret',
    'test-openai-secret',
    'test-weather-secret',
    'test-removebg-secret',
    'test-nvidia-nim-secret',
    'test-zai-secret'
  ];

  try {
    names.forEach((name) => delete process.env[name]);
    process.env.GEMINI_API_KEY = secrets[0];
    process.env.GOOGLE_AI_API_KEY = secrets[0];
    process.env.OPENROUTER_API_KEY = secrets[1];
    process.env.OPENAI_API_KEY = secrets[2];
    process.env.NVIDIA_NIM_API_KEY = secrets[5];
    process.env.NVIDIA_API_KEY = secrets[5];
    process.env.ZAI_API_KEY = secrets[6];
    process.env.AI_PROVIDER_PRIORITY = 'nvidia,zai,gemini';
    process.env.OPENWEATHER_API_KEY = secrets[3];
    process.env.REMOVEBG_KEY = secrets[4];
    process.env.YOUTUBE_API_KEY = 'shared-youtube-client-key';
    process.env.YOUTUBE_API_KEY_WEB = 'configured-youtube-client-key';

    global.fetch = async (url, options) => {
      requests.push({ url: String(url), options });
      return { ok: true, status: 200 };
    };

    let responseText = '';
    await command.execute(null, null, [], {
      reply: async (text) => {
        responseText = text;
      }
    });

    assert.equal(command.ownerOnly, true);
    assert.equal(requests.length, 7);
    assert.match(responseText, /GEMINI_API_KEY: ✅ working/);
    assert.match(responseText, /GOOGLE_AI_API_KEY: ✅ working/);
    assert.match(responseText, /OPENROUTER_API_KEY: ✅ working/);
    assert.match(responseText, /NVIDIA_NIM_API_KEY: ✅ working/);
    assert.match(responseText, /ZAI_API_KEY: ✅ working/);
    assert.match(responseText, /OPENAI_API_KEY: ✅ working/);
    assert.match(responseText, /OPENWEATHER_API_KEY: ✅ working/);
    assert.match(responseText, /REMOVEBG_KEY: ✅ working/);
    assert.match(responseText, /YOUTUBE_API_KEY: set \(used by YouTube client; not independently tested\)/);
    assert.match(responseText, /YOUTUBE_API_KEY_WEB: set \(used by YouTube client; not independently tested\)/);
    assert.match(responseText, /NEWS_API_KEY/);
    assert.match(responseText, /AUDD_API_KEY/);
    for (const secret of secrets) assert.equal(responseText.includes(secret), false);
    assert.equal(responseText.includes('configured-youtube-client-key'), false);
    assert.equal(responseText.includes('shared-youtube-client-key'), false);

    console.log('API key checker tests passed.');
  } finally {
    for (const name of names) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
    global.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
