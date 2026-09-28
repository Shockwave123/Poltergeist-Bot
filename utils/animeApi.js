/**
 * Anime API helpers.
 */

const axios = require('axios');

const IMAGE_API = 'https://nekos.life/api/v2/img';
const ANIME_API = 'https://kitsu.io/api/edge/anime';
const MAX_IMAGE_SIZE = 7 * 1024 * 1024;

async function getAnimeImage(category) {
  const supportedCategories = {
    hneko: 'lewd',
    hwaifu: 'fox_girl',
    konachan: 'smug',
    megumin: 'waifu',
    milf: 'lewd',
    neko: 'neko',
    waifu: 'waifu',
    loli: 'pat',
  };
  const sourceCategory = supportedCategories[category] || 'waifu';
  const cacheBust = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const { data } = await axios.get(`${IMAGE_API}/${sourceCategory}?cacheBust=${cacheBust}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    timeout: 30000,
  });
  const imageUrl = data?.url;

  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Invalid API response: missing image URL');
  }

  const imageResponse = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
    timeout: 30000,
    maxContentLength: MAX_IMAGE_SIZE,
    maxBodyLength: MAX_IMAGE_SIZE,
  });

  const imageBuffer = Buffer.from(imageResponse.data);
  if (!imageBuffer.length) {
    throw new Error('Empty image response');
  }
  if (imageBuffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 7MB)`);
  }

  return { imageUrl, imageResponse, imageBuffer };
}

async function getRandomAnime() {
  const { data } = await axios.get(ANIME_API, {
    params: { 'page[limit]': 20, sort: '-updatedAt' },
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/vnd.api+json' },
    timeout: 30000,
  });
  const entries = Array.isArray(data?.data) ? data.data : [];
  const entry = entries[Math.floor(Math.random() * entries.length)];
  const attributes = entry?.attributes;

  if (!attributes) {
    throw new Error('Invalid API response: missing anime data');
  }

  return {
    title: attributes.canonicalTitle || attributes.titles?.en_jp || 'Unknown',
    episodes: attributes.episodeCount,
    status: attributes.status,
    synopsis: attributes.synopsis,
    link: entry.links?.self,
    thumbnail: attributes.posterImage?.large || attributes.posterImage?.original,
  };
}

module.exports = { getAnimeImage, getRandomAnime, MAX_IMAGE_SIZE };
