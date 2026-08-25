/**
 * Google Gemini helpers for text and multimodal requests.
 */

const axios = require('axios');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function getApiKey(userKey) {
  const key = userKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error(getSetupMessage());
  return key;
}

function isConfigured() {
  return Boolean(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);
}

function getSetupMessage() {
  return 'Google AI is not configured. Get a key at https://aistudio.google.com/app/apikey, then add GOOGLE_AI_API_KEY to the bot environment (PowerShell: $env:GOOGLE_AI_API_KEY="your_key"; hosting: add it under Environment Variables). Restart the bot afterward. Never send the key in WhatsApp chat.';
}

async function generateContent(parts, options = {}) {
  const response = await axios.post(API_URL, {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      topP: options.topP ?? 0.9,
      maxOutputTokens: options.maxOutputTokens ?? 700,
    },
  }, {
    params: { key: getApiKey(options.apiKey) },
    headers: { 'Content-Type': 'application/json' },
    timeout: options.timeout || 90000,
  });

  const text = response.data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join(' ')
    .trim();
  if (!text) throw new Error('Google AI returned no text.');
  return text;
}

module.exports = { generateContent, getSetupMessage, isConfigured };
