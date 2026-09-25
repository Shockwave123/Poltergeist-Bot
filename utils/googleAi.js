/**
 * Unified AI Engine - Supports Google Gemini and OpenRouter API
 * Seamless text and multimodal generation with dynamic model fallback.
 */

const axios = require('axios');

// ==========================================
// Google Gemini Configuration & Fallbacks
// ==========================================
const GEMINI_STATIC_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
];

const EXCLUDED_MODEL_PATTERN = /(image|tts|embedding|aqa|robotics|computer[-_]?use|native[-_]?audio|live[-_]?api)/i;
const MODEL_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const discoveredGeminiModelsCache = new Map(); // apiKey -> { models: string[], fetchedAt: number }
const workingGeminiModelCache = new Map(); // apiKey -> model name that last succeeded

// ==========================================
// OpenRouter Configuration & Fallbacks
// ==========================================
const OPENROUTER_TEXT_MODELS = [
  'google/gemini-2.0-flash-001',
  'deepseek/deepseek-chat',
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-24b-instruct-2501:free',
  'openrouter/auto',
];

const OPENROUTER_VISION_MODELS = [
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'qwen/qwen-2.5-vl-72b-instruct:free',
  'openai/gpt-4o-mini',
];

const workingOpenRouterModelCache = new Map(); // apiKey -> model name that last succeeded

// Periodically clear model caches to prevent unbounded RAM growth
setInterval(() => {
  discoveredGeminiModelsCache.clear();
  workingGeminiModelCache.clear();
  workingOpenRouterModelCache.clear();
}, MODEL_CACHE_TTL);

/**
 * Resolve the ordered list of AI credentials to try.
 *
 * Order: explicit key -> the user's personal key -> global Gemini keys -> global OpenRouter keys.
 * Both GEMINI_API_KEY/GEMINI_API_KEYS/GOOGLE_AI_API_KEY and OPENROUTER_API_KEY/OPENROUTER_API_KEYS
 * accept several keys separated by commas, spaces or new lines, so the bot keeps answering
 * when one key runs out of quota or a provider is temporarily offline.
 * Set AI_PROVIDER_PRIORITY=openrouter to try OpenRouter before Gemini.
 */
function resolveAiCredentialChain(options = {}) {
  const chain = [];
  const seen = new Set();

  const push = (key, provider, source) => {
    const clean = String(key || '').trim().replace(/^["']|["']$/g, '');
    if (clean.length < 15 || seen.has(clean)) return;
    seen.add(clean);
    const resolvedProvider = provider || detectProviderFromKey(clean);
    chain.push({
      key: clean,
      provider: resolvedProvider,
      source,
      label: providerLabel(resolvedProvider),
      healthId: keyId(resolvedProvider, clean),
    });
  };

  // 1. Explicit key passed by the caller
  if (options.apiKey && typeof options.apiKey === 'string') {
    push(options.apiKey, options.provider, 'options');
  }

  // 2. Per-user key saved with `.aikey set`
  if (options.senderId) {
    try {
      const { getUserAiConfig } = require('./userApiKeys');
      const userConf = getUserAiConfig(options.senderId);
      if (userConf && userConf.key) push(userConf.key, userConf.provider, 'personal');
    } catch (e) {
      // Ignore if userApiKeys is unavailable
    }
  }

  // 3. Global environment keys, respecting the configured provider priority
  for (const provider of providerPriority()) {
    for (const key of collectProviderKeys(provider)) push(key, provider, 'global');
  }

  return chain;
}

/**
 * Resolve a single AI credential (first entry of the failover chain).
 * Kept for backwards compatibility with commands that only need one key.
 */
function resolveAiCredentials(options = {}) {
  const [first] = resolveAiCredentialChain(options);
  return first ? { key: first.key, provider: first.provider, source: first.source } : null;
}

// ==========================================
// Provider helpers, multi-key parsing & health tracking
// ==========================================

const AI_KEY_COOLDOWN_MS = {
  invalid: 10 * 60 * 1000, // dead key - park it for 10 minutes
  rateLimit: 60 * 1000, // quota/rate limit - retry after a minute
  network: 45 * 1000, // provider offline/unreachable
  server: 30 * 1000, // 5xx from the provider
  other: 15 * 1000,
};

const aiKeyHealth = new Map(); // healthId -> { downUntil, lastError, lastOkAt, failCount }

/** Stable, non-reversible id used to track a key's health without logging it. */
function keyId(provider, key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 1000000007;
  return `${provider === 'openrouter' ? 'or' : 'gm'}:${key.slice(0, 4)}…${String(hash).slice(-4)}`;
}

function providerLabel(provider) {
  return provider === 'openrouter' ? 'OpenRouter' : 'Google Gemini';
}

function detectProviderFromKey(key) {
  const clean = String(key || '').trim();
  return clean.startsWith('sk-or-') || clean.startsWith('sk-') ? 'openrouter' : 'gemini';
}

/** Provider try-order (env AI_PROVIDER_PRIORITY=openrouter flips the default). */
function providerPriority() {
  const preferred = String(process.env.AI_PROVIDER_PRIORITY || 'gemini').toLowerCase();
  return preferred.startsWith('open') ? ['openrouter', 'gemini'] : ['gemini', 'openrouter'];
}

/** Read every key configured for a provider (several keys per variable are supported). */
function collectProviderKeys(provider) {
  const raw = provider === 'openrouter'
    ? [process.env.OPENROUTER_API_KEYS, process.env.OPENROUTER_API_KEY]
    : [process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY, process.env.GOOGLE_AI_API_KEY];
  return [...new Set(
    raw.filter(Boolean).join(',')
      .split(/[\s,;]+/)
      .map((key) => key.trim().replace(/^["']|["']$/g, ''))
      .filter((key) => key.length >= 15)
  )];
}

function isKeyCoolingDown(id) {
  const health = aiKeyHealth.get(id);
  return Boolean(health && health.downUntil > Date.now());
}

function markKeyOk(id) {
  aiKeyHealth.set(id, { downUntil: 0, lastError: '', lastOkAt: Date.now(), failCount: 0 });
}

function markKeyDown(id, kind, message) {
  const previous = aiKeyHealth.get(id) || { failCount: 0, lastOkAt: 0 };
  const cooldownMs = AI_KEY_COOLDOWN_MS[kind] || AI_KEY_COOLDOWN_MS.other;
  aiKeyHealth.set(id, {
    downUntil: Date.now() + cooldownMs,
    cooldownMs,
    lastError: message || '',
    lastOkAt: previous.lastOkAt || 0,
    failCount: (previous.failCount || 0) + 1,
  });
}

/** Work out why a provider call failed so the right cooldown can be applied. */
function classifyAiError(error) {
  const status = error?.response?.status;
  const code = String(error?.code || '');
  const message = String(error?.response?.data?.error?.message || error?.message || '').toLowerCase();

  if (status === 401 || status === 403 || message.includes('invalid api key') || message.includes('api_key_invalid')) {
    return 'invalid';
  }
  if (status === 429 || message.includes('rate limit') || message.includes('quota') || message.includes('resource_exhausted') || message.includes('insufficient')) {
    return 'rateLimit';
  }
    if (!error?.response || code === 'ECONNABORTED' || code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN' || message.includes('offline')) {
    return 'network';
  }
  if (status >= 500) return 'server';
  // "overloaded" / "service unavailable" style messages from either provider
  if (message.includes('overloaded') || message.includes('temporarily unavailable') || message.includes('service unavailable')) {
    return 'server';
  }
  return 'other';
}

/**
 * Snapshot of provider health for diagnostics (`.health`, `.aikey` status).
 */
function getAiHealth() {
  const chain = resolveAiCredentialChain({});
  const entries = chain.map((entry) => {
    const health = aiKeyHealth.get(entry.healthId) || {};
    const cooling = health.downUntil > Date.now();
    return {
      provider: entry.provider,
      label: entry.label,
      source: entry.source,
      keyId: entry.healthId,
      status: cooling ? 'cooling-down' : (health.failCount ? 'recovering' : 'ready'),
      cooldownSeconds: cooling ? Math.ceil((health.downUntil - Date.now()) / 1000) : 0,
      lastError: health.lastError || '',
      lastOkAt: health.lastOkAt || 0,
      failCount: health.failCount || 0,
    };
  });

  return {
    configured: chain.length > 0,
    totalKeys: chain.length,
    geminiKeys: chain.filter((entry) => entry.provider === 'gemini').length,
    openrouterKeys: chain.filter((entry) => entry.provider === 'openrouter').length,
    priority: providerPriority(),
    entries,
  };
}


function isConfigured(userKey = null) {
  if (userKey) return true;
  return Boolean(
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_API_KEYS ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENROUTER_API_KEYS
  );
}

function getSetupMessage() {
  return [
    '🤖 *AI features are not configured yet!*',
    '',
    'You can easily set up your API key in a private chat:',
    '',
    '🔹 *Option 1: Google Gemini (Recommended - Free)*',
    '1. Get a free key at: https://aistudio.google.com/app/apikey',
    '2. Send in private chat: `.aikey set YOUR_GEMINI_KEY`',
    '',
    '🔹 *Option 2: OpenRouter (Multi-Model)*',
    '1. Get an API key at: https://openrouter.ai/keys',
    '2. Send in private chat: `.aikey set YOUR_OPENROUTER_KEY`',
    '',
    '💡 *For Bot Owners:* You can also add `GEMINI_API_KEY` or `OPENROUTER_API_KEY` to your deployment environment variables so AI works for all members.'
  ].join('\n');
}

// Lower score = preferred. Stable flash models first; newer versions win ties.
function rankGeminiModel(name) {
  const n = name.toLowerCase();
  let score;
  if (n.includes('flash') && !n.includes('lite')) score = 0;
  else if (n.includes('flash')) score = 1;
  else if (n.includes('lite')) score = 2;
  else if (n.includes('pro')) score = 3;
  else score = 4;
  if (/preview|experimental|exp/.test(n)) score += 10;
  const version = parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1]);
  if (!Number.isNaN(version)) score -= version / 100;
  return score;
}

// Asks Google which models this API key can actually call generateContent on.
async function discoverGeminiModels(apiKey) {
  const cached = discoveredGeminiModelsCache.get(apiKey);
  if (cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL) return cached.models;

  const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
    params: { key: apiKey, pageSize: 100 },
    timeout: 30000,
  });

  const models = (response.data?.models || [])
    .filter((model) => Array.isArray(model.supportedGenerationMethods)
      && model.supportedGenerationMethods.includes('generateContent'))
    .map((model) => String(model.name || '').replace(/^models\//, ''))
    .filter((name) => name && !EXCLUDED_MODEL_PATTERN.test(name))
    .sort((a, b) => rankGeminiModel(a) - rankGeminiModel(b));

  discoveredGeminiModelsCache.set(apiKey, { models, fetchedAt: Date.now() });
  return models;
}

/**
 * Execute generation via Google Gemini API
 */
async function generateGeminiContent(parts, apiKey, options = {}) {
  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.5,
      topP: options.topP ?? 0.9,
      maxOutputTokens: options.maxOutputTokens ?? 750,
    },
  };

  const configuredModels = [process.env.GEMINI_MODEL, ...GEMINI_STATIC_MODELS]
    .filter((model, idx, arr) => model && arr.indexOf(model) === idx);

  const candidates = [workingGeminiModelCache.get(apiKey), ...configuredModels]
    .filter((model, idx, arr) => model && arr.indexOf(model) === idx);

  const tried = [];
  let response = null;
  let lastError = null;

  const attemptModel = async (model) => {
    tried.push(model);
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await axios.post(apiUrl, payload, {
          params: { key: apiKey },
          headers: { 'Content-Type': 'application/json' },
          timeout: options.timeout || 90000,
        });
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        if (status === 404) return null; // Model not available for key
        if (status === 400 && error.response?.data?.error?.message?.includes('API_KEY_INVALID')) {
          throw new Error('Invalid Google Gemini API key. Please check your key at https://aistudio.google.com.');
        }
        if (status === 429 && attempt === 2) return null; // Quota exhausted, try fallback
        const retryable = !error.response || status === 408 || status === 429 || status >= 500;
        if (attempt === 2 || !retryable) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    return null;
  };

  for (const model of candidates) {
    response = await attemptModel(model);
    if (response) break;
    if (workingGeminiModelCache.get(apiKey) === model) workingGeminiModelCache.delete(apiKey);
  }

  // If candidate models failed with 404, dynamically query available models
  if (!response && lastError?.response?.status === 404) {
    let discovered = [];
    try {
      discovered = await discoverGeminiModels(apiKey);
    } catch (e) {
      // Best-effort discovery
    }
    for (const model of discovered) {
      if (tried.includes(model)) continue;
      response = await attemptModel(model);
      if (response) break;
    }
  }

  if (!response) {
    if (lastError?.response?.status === 404) {
      throw new Error(`No Gemini model found for this key. Tried: ${tried.join(', ')}. Create a new key at https://aistudio.google.com.`);
    }
    if (lastError?.response?.status === 429) {
      throw new Error('Google Gemini rate limit/quota reached. Please wait a moment or try another model.');
    }
    throw lastError || new Error('Google Gemini request failed.');
  }

  const text = response.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join(' ')
    .trim();

  if (!text) throw new Error('Google Gemini returned an empty response.');

  const usedModel = tried[tried.length - 1];
  if (usedModel) workingGeminiModelCache.set(apiKey, usedModel);
  return text;
}

/**
 * Format Gemini-style parts into OpenAI / OpenRouter messages format.
 */
function formatOpenRouterMessages(parts) {
  const hasInlineMedia = parts.some((p) => p.inlineData);

  if (!hasInlineMedia) {
    const fullText = parts.map((p) => p.text || '').join('\n').trim();
    return [{ role: 'user', content: fullText }];
  }

  const contentArray = [];
  for (const part of parts) {
    if (part.text) {
      contentArray.push({ type: 'text', text: part.text });
    } else if (part.inlineData) {
      const mime = part.inlineData.mimeType || 'image/jpeg';
      const base64Data = part.inlineData.data;
      contentArray.push({
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${base64Data}`,
        },
      });
    }
  }

  return [{ role: 'user', content: contentArray }];
}

/**
 * Execute generation via OpenRouter API
 */
async function generateOpenRouterContent(parts, apiKey, options = {}) {
  const hasMedia = parts.some((p) => p.inlineData);
  const messages = formatOpenRouterMessages(parts);

  const modelPool = hasMedia
    ? [process.env.OPENROUTER_VISION_MODEL, ...OPENROUTER_VISION_MODELS]
    : [process.env.OPENROUTER_MODEL, ...OPENROUTER_TEXT_MODELS];

  const uniqueModels = [workingOpenRouterModelCache.get(apiKey), ...modelPool]
    .filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let lastError = null;
  const tried = [];

  for (const model of uniqueModels) {
    tried.push(model);
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages,
          temperature: options.temperature ?? 0.6,
          max_tokens: options.maxOutputTokens ?? 750,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/Poltergeist-Bot',
            'X-Title': 'Poltergeist MD WhatsApp Bot',
            'Content-Type': 'application/json',
          },
          timeout: options.timeout || 90000,
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (content && typeof content === 'string' && content.trim()) {
        workingOpenRouterModelCache.set(apiKey, model);
        return content.trim();
      }
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error?.message || err.message;

      // Handle invalid key immediately
      if (status === 401 || errorMsg?.toLowerCase()?.includes('invalid api key')) {
        throw new Error('Invalid OpenRouter API key. Please check your key at https://openrouter.ai/keys.');
      }

      // Handle insufficient credits
      if (status === 402 || errorMsg?.toLowerCase()?.includes('credits') || errorMsg?.toLowerCase()?.includes('insufficient')) {
        throw new Error('OpenRouter account has insufficient credits. Check your balance at https://openrouter.ai/credits.');
      }

      // If 404 (model not found) or 429 (rate limit), continue to next fallback model
      if (status === 404 || status === 429 || status >= 500) {
        continue;
      }

      // Non-retryable client error
      if (status === 400) {
        throw new Error(`OpenRouter Error: ${errorMsg}`);
      }
    }
  }

  if (lastError?.response?.status === 429) {
    throw new Error('OpenRouter rate limit reached on available models. Please try again shortly.');
  }

  throw lastError || new Error(`Failed to generate response using OpenRouter models (${tried.join(', ')}).`);
}

/**
 * Universal content generation function.
 * Seamlessly routes to Google Gemini or OpenRouter based on available key.
 *
 * @param {Array} parts - Array of content parts ({ text } and/or { inlineData })
 * @param {Object} options - { apiKey, provider, senderId, temperature, maxOutputTokens, timeout }
 * @returns {Promise<string>} Generated text
 */
async function generateContent(parts, options = {}) {
  const chain = resolveAiCredentialChain(options);

  if (!chain.length) {
    throw new Error(getSetupMessage());
  }

  // testAiKey()/explicit key checks must not silently succeed on a fallback key
  const candidates = options.noFailover ? chain.slice(0, 1) : chain;

  const preferred = candidates.filter((entry) => !isKeyCoolingDown(entry.healthId));
  const ordered = preferred.length ? preferred : candidates; // all cooling down? try anyway

  const failures = [];

  for (const entry of ordered) {
    try {
      const text = entry.provider === 'openrouter'
        ? await generateOpenRouterContent(parts, entry.key, options)
        : await generateGeminiContent(parts, entry.key, options);

      markKeyOk(entry.healthId);

      // Let the caller know a fallback provider answered instead of the preferred one
      if (failures.length && typeof options.onProviderSwitch === 'function') {
        try {
          options.onProviderSwitch({ from: failures[0], to: entry });
        } catch (e) {
          // Callback errors must never break generation
        }
      }

      return text;
    } catch (error) {
      const kind = classifyAiError(error);
      markKeyDown(entry.healthId, kind, error.message);
      failures.push(`${entry.label} (${entry.source}) [${kind}]: ${error.message}`);

      // A single-key test must surface the exact provider error
      if (options.noFailover) throw error;
    }
  }

  throw new Error(
    '❌ All configured AI providers failed, so the request could not be answered.\n\n' +
    failures.map((line) => `• ${line}`).join('\n')
  );
}

/**
 * Quick ping test for an API key to verify validity before saving.
 *
 * @param {string} key - The API key
 * @param {string} provider - 'gemini' | 'openrouter'
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function testAiKey(key, provider) {
  try {
    const testParts = [{ text: 'Respond with the word "OK" only.' }];
    const res = await generateContent(testParts, {
      apiKey: key,
      provider,
      noFailover: true, // only test the key the user just provided
      temperature: 0.1,
      maxOutputTokens: 10,
      timeout: 15000,
    });
    return { ok: true, message: res };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

module.exports = {
  generateContent,
  getSetupMessage,
  isConfigured,
  resolveAiCredentials,
  resolveAiCredentialChain,
  testAiKey,
  getAiHealth,
  providerLabel,
  detectProviderFromKey,
  classifyAiError,
};
