const SEARCH_URLS = {
  spotify: (query) => `https://open.spotify.com/search/${encodeURIComponent(query)}`,
  audiomack: (query) => `https://audiomack.com/search?q=${encodeURIComponent(query)}`,
  youtube: (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
  tiktok: (query) => `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`,
  instagram: (query) => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`,
  facebook: (query) => `https://www.facebook.com/search/top/?q=${encodeURIComponent(query)}`,
  twitter: (query) => `https://x.com/search?q=${encodeURIComponent(query)}`,
  pinterest: (query) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
  soundcloud: (query) => `https://soundcloud.com/search?q=${encodeURIComponent(query)}`
};

function buildPlatformSearchLink(platform, query) {
  const builder = SEARCH_URLS[String(platform || '').toLowerCase()];
  if (!builder) throw new Error('Unsupported platform.');
  return builder(String(query || '').trim());
}

module.exports = { buildPlatformSearchLink, SEARCH_URLS };