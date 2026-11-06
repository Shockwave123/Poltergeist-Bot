/**
 * Owner-only inventory and read-only checks for supported provider API keys.
 * Key values are never included in the response or logs.
 */

const crypto = require('node:crypto');
const { URLSearchParams } = require('node:url');

const REQUEST_TIMEOUT_MS = 10000;

const PROVIDER_TESTS = {
  gemini: async (key) => request('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
    headers: { 'x-goog-api-key': key }
  }),
  openrouter: async (key) => request('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${key}` }
  }),
  openai: async (key) => request('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` }
  }),
  openweather: async (key) => {
    const params = new URLSearchParams({ q: 'London', appid: key });
    return request(`https://api.openweathermap.org/data/2.5/weather?${params}`);
  },
  removebg: async (key) => request('https://api.remove.bg/v1.0/account', {
    headers: { 'X-Api-Key': key }
  })
};

const ENV_KEY_GROUPS = [
  { name: 'GEMINI_API_KEY', provider: 'gemini' },
  { name: 'GEMINI_API_KEYS', provider: 'gemini' },
  { name: 'GOOGLE_AI_API_KEY', provider: 'gemini' },
  { name: 'OPENROUTER_API_KEY', provider: 'openrouter' },
  { name: 'OPENROUTER_API_KEYS', provider: 'openrouter' },
  { name: 'OPENAI_API_KEY', provider: 'openai' },
  { name: 'OPENWEATHER_API_KEY', provider: 'openweather' },
  { name: 'REMOVEBG_KEY', provider: 'removebg' }
];

const UNTESTED_ENV_KEY_NAMES = [
  'YOUTUBE_API_KEY',
  'YOUTUBE_API_KEY_WEB',
  'YOUTUBE_API_KEY_ANDROID',
  'YOUTUBE_API_KEY_IOS',
  'YOUTUBE_API_KEY_TV',
  'NEWS_API_KEY',
  'AUDD_API_KEY'
];

const EMBEDDED_KEY_INVENTORY = [
  {
    names: ['YOUTUBE_API_KEY', 'YOUTUBE_API_KEY_WEB', 'YOUTUBE_API_KEY_ANDROID', 'YOUTUBE_API_KEY_IOS', 'YOUTUBE_API_KEY_TV'],
    location: 'utils/mediaResolver.js',
    note: 'YOUTUBE_API_KEY is the shared Render variable. Client-specific variables override it; code fallback values are used if none are set.'
  },
  {
    names: ['NEWS_API_KEY'],
    location: 'New Commands/news.js',
    note: 'An embedded credential exists in an unloaded command. NEWS_API_KEY is a recommended replacement, but is not wired there yet.'
  },
  {
    names: ['AUDD_API_KEY'],
    location: 'New Commands/shazam.js',
    note: 'An embedded credential exists in an unloaded command. AUDD_API_KEY is a recommended replacement, but is not wired there yet.'
  },
  {
    names: ['OPENWEATHER_API_KEY'],
    location: 'New Commands/weather.js',
    note: 'The active weather command uses OPENWEATHER_API_KEY; this legacy command is not loaded.'
  }
];

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (response.body && typeof response.body.cancel === 'function') {
    await response.body.cancel();
  }

  if (response.ok) return { status: response.status, result: 'working' };
  if (response.status === 401 || response.status === 403) {
    return { status: response.status, result: 'rejected' };
  }
  if (response.status === 429) {
    return { status: response.status, result: 'rate-limited' };
  }
  return { status: response.status, result: 'error' };
}

function splitKeys(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((key) => key.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function fingerprint(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function formatResult(result) {
  if (result.result === 'working') return `✅ working (HTTP ${result.status})`;
  if (result.result === 'rejected') return `❌ rejected or unauthorized (HTTP ${result.status}; check key/access)`;
  if (result.result === 'rate-limited') return '⚠️ rate-limited; key validity is inconclusive';
  return `⚠️ provider check failed (HTTP ${result.status})`;
}

async function checkKey(provider, key) {
  try {
    return await PROVIDER_TESTS[provider](key);
  } catch (error) {
    return {
      result: 'network-error',
      message: error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'request timed out'
        : 'provider could not be reached'
    };
  }
}

module.exports = {
  name: 'apikeys',
  aliases: ['apicheck', 'keycheck', 'testkeys'],
  category: 'owner',
  description: 'List API-key environment names and test configured provider keys without revealing values',
  usage: '.apikeys',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const testedKeys = new Map();
    const jobs = [];
    const configuredNames = new Set();
    const envRows = [];
    const lines = [
      '🔐 *API KEY CHECK*',
      '_Key values are never displayed._',
      '',
      '*Render environment keys*'
    ];

    for (const group of ENV_KEY_GROUPS) {
      const keys = splitKeys(process.env[group.name]);
      if (!keys.length) {
        envRows.push(`• ${group.name}: not set`);
        continue;
      }

      configuredNames.add(group.name);
      keys.forEach((key, index) => {
        const id = `${group.provider}:${fingerprint(key)}`;
        const label = keys.length > 1 ? `${group.name} [${index + 1}]` : group.name;
        if (!testedKeys.has(id)) {
          const job = checkKey(group.provider, key);
          testedKeys.set(id, job);
          jobs.push(job);
        }
        envRows.push({ label, id });
      });
    }

    for (const name of UNTESTED_ENV_KEY_NAMES) {
      if (String(process.env[name] || '').trim()) {
        configuredNames.add(name);
        const detail = name === 'YOUTUBE_API_KEY' || name.startsWith('YOUTUBE_API_KEY_')
          ? 'used by YouTube client; not independently tested'
          : 'not tested (legacy/inactive command credential)';
        envRows.push(`• ${name}: set (${detail})`);
      } else {
        envRows.push(`• ${name}: not set`);
      }
    }

    await Promise.all(jobs);

    for (const entry of envRows) {
      if (typeof entry === 'string') {
        lines.push(entry);
        continue;
      }

      const result = await testedKeys.get(entry.id);
      if (result.result === 'network-error') {
        lines.push(`• ${entry.label}: ⚠️ ${result.message}`);
      } else {
        lines.push(`• ${entry.label}: ${formatResult(result)}`);
      }
    }

    lines.push('', '*Legacy/embedded credential sources*');
    for (const entry of EMBEDDED_KEY_INVENTORY) {
      const state = entry.names.some((name) => configuredNames.has(name)) ? '; matching Render variable is set' : '';
      lines.push(`• ${entry.names.join(', ')} (${entry.location}${state})`);
      lines.push(`  ${entry.note}`);
    }

    lines.push(
      '',
      '*Other secrets (not API keys):* SESSION_ID, USER_KEYS_ENCRYPTION_KEY.',
      'Per-user API keys saved in bot storage are not included in this server-level check.',
      'Keys hard-coded in source should be replaced with your own provider keys and rotated if they were exposed.'
    );

    return extra.reply(lines.join('\n'));
  }
};
