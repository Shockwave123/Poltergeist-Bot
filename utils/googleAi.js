/**
 * Google Gemini helpers for text and multimodal requests.
 */

const axios = require('axios');

// Static fallbacks, tried in order. Newer API keys may not have access to
// older models (Google returns 404 for restricted/retired models), so model
// availability is also discovered dynamically per API key.
const STATIC_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
];

// Models that support generateContent but are unsuitable for chat/vision text.
const EXCLUDED_MODEL_PATTERN = /(image|tts|embedding|aqa|robotics|computer[-_]?use|native[-_]?audio|live[-_]?api)/i;

const MODEL_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const discoveredModelsCache = new Map(); // apiKey -> { models: string[], fetchedAt: number }
const workingModelCache = new Map(); // apiKey -> model name that last succeeded

function getApiKey(userKey) {
  const key = userKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error(getSetupMessage());
  return key;
}

function isConfigured() {
  return Boolean(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);
}

function getSetupMessage() {
  return 'Google AI is not configured. In a private chat, get a key at https://aistudio.google.com/app/apikey, then send `.googleai set YOUR_KEY`. Never post the key in a group or share it with anyone.';
}

function getConfiguredModels() {
  return [process.env.GEMINI_MODEL, ...STATIC_MODELS]
    .filter((model, index, models) => model && models.indexOf(model) === index);
}

// Lower score = preferred. Stable flash models first; newer versions win ties.
function rankModel(name) {
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
async function discoverModels(apiKey) {
  const cached = discoveredModelsCache.get(apiKey);
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
    .sort((a, b) => rankModel(a) - rankModel(b));

  discoveredModelsCache.set(apiKey, { models, fetchedAt: Date.now() });
  return models;
}

async function generateContent(parts, options = {}) {
  const apiKey = getApiKey(options.apiKey);
  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      topP: options.topP ?? 0.9,
      maxOutputTokens: options.maxOutputTokens ?? 700,
    },
  };

  const tried = [];
  let response;
  let lastError;

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
        if (status === 404) return null; // model not available for this key
        if (status === 429 && attempt === 2) return null; // quota exhausted on this model, try another
        const retryable = !error.response || status === 408 || status === 429 || status >= 500;
        if (attempt === 2 || !retryable) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    return null;
  };

  // Candidate order: the model that last worked for this key, then the
  // configured/static list.
  const candidates = [workingModelCache.get(apiKey), ...getConfiguredModels()]
    .filter((model, index, models) => model && models.indexOf(model) === index);

  for (const model of candidates) {
    response = await attemptModel(model);
    if (response) break;
    if (workingModelCache.get(apiKey) === model) workingModelCache.delete(apiKey);
  }

  // Every candidate was unavailable: ask Google which models THIS key can use.
  if (!response && lastError?.response?.status === 404) {
    let discovered = [];
    try {
      discovered = await discoverModels(apiKey);
    } catch (error) {
      // Discovery is best-effort; the original 404 remains the reported error.
    }
    for (const model of discovered) {
      if (tried.includes(model)) continue;
      response = await attemptModel(model);
      if (response) break;
    }
  }

  if (!response) {
    if (lastError?.response?.status === 404) {
      throw new Error(`No configured Gemini model is available for this API key. Tried: ${tried.join(', ')}. Set GEMINI_MODEL to a model your key can access (see https://aistudio.google.com).`);
    }
    throw lastError || new Error('Google AI request failed.');
  }

  const text = response.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join(' ')
    .trim();
  if (!text) throw new Error('Google AI returned no text.');

  const usedModel = tried[tried.length - 1];
  if (usedModel) workingModelCache.set(apiKey, usedModel);
  return text;
}

module.exports = { generateContent, getSetupMessage, isConfigured };
