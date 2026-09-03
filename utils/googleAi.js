/**
 * Google Gemini helpers for text and multimodal requests.
 */

const axios = require('axios');

const MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
].filter((model, index, models) => model && models.indexOf(model) === index);

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

async function generateContent(parts, options = {}) {
  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      topP: options.topP ?? 0.9,
      maxOutputTokens: options.maxOutputTokens ?? 700,
    },
  };
  let response;
  let lastError;
  for (const model of MODELS) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        response = await axios.post(apiUrl, payload, {
          params: { key: getApiKey(options.apiKey) },
          headers: { 'Content-Type': 'application/json' },
          timeout: options.timeout || 90000,
        });
        break;
      } catch (error) {
        lastError = error;
        if (error.response?.status === 404) break;
        const retryable = !error.response || error.response.status === 408 || error.response.status === 429 || error.response.status >= 500;
        if (attempt === 2 || !retryable) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    if (response) break;
  }

  if (!response) {
    if (lastError?.response?.status === 404) {
      throw new Error(`No configured Gemini model is available. Tried: ${MODELS.join(', ')}. Set GEMINI_MODEL to a supported model.`);
    }
    throw lastError || new Error('Google AI request failed.');
  }

  const text = response.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join(' ')
    .trim();
  if (!text) throw new Error('Google AI returned no text.');
  return text;
}

module.exports = { generateContent, getSetupMessage, isConfigured };
