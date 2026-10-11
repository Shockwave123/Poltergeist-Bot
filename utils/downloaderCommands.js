const { buildPlatformSearchLink } = require('./platformSearch');
const { fetchPublicUrl } = require('./webContent');
const mediaResolver = require('./mediaResolver');

const DOWNLOADER_DATABASE = {
  soundcloud: { name: 'soundcloud', icon: '🎧', label: 'SOUNDCLOUD', searchUrl: (q) => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`, resolve: async (url, query) => mediaResolver.soundcloudSearch(url || query) },
  spotify: { name: 'spotify', icon: '🎵', label: 'SPOTIFY', searchUrl: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`, resolve: async (url, query) => mediaResolver.spotifyResolve(url || query) },
  itunes: { name: 'itunes', icon: '🎶', label: 'iTUNES', searchUrl: (q) => `https://music.apple.com/search?term=${encodeURIComponent(q)}`, resolve: async (url, query) => mediaResolver.itunesSearch(url || query) },
  deezer: { name: 'deezer', icon: '🎵', label: 'DEEZER', searchUrl: (q) => `https://www.deezer.com/search?q=${encodeURIComponent(q)}`, resolve: async (url, query) => mediaResolver.deezerSearch(url || query) },
  tiktok: { name: 'tiktok', icon: '🎵', label: 'TIKTOK', searchUrl: (q) => `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`, resolve: async (url, query) => mediaResolver.tiktokDownload(url || query) },
  audiomack: { name: 'audiomack', icon: '🎧', label: 'AUDIOMACK', searchUrl: (q) => `https://audiomack.com/search?q=${encodeURIComponent(q)}`, resolve: async (url, query) => mediaResolver.audiomackSearch(url || query) },
  youtube: { name: 'youtube', icon: '▶️', label: 'YOUTUBE', searchUrl: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, resolve: async (url, query) => mediaResolver.youtubeSearch(url || query) }
};

const DOWNLOADER_COMMANDS = Object.values(DOWNLOADER_DATABASE).map((platform) => ({
  name: platform.name,
  aliases: [platform.name],
  category: 'downloaders',
  description: `Search for music on ${platform.label}`,
  usage: `.${platform.name} <search terms>`,
  async execute(sock, msg, args, extra) {
    try {
      const query = args.join(' ').trim();
      if (!query) {
        return extra.reply(`Usage: .${platform.name} <search terms>\\n\\nOpening ${platform.label} search for: ${query || 'nothing'}: ` + platform.searchUrl(query || 'search'));
      }
      const url = platform.searchUrl(query);
      return extra.reply(`🔍 *${platform.label} search*\\n${query}\\n${url}\\n\\nOpen the official platform to play or download content you're authorized to access.`);
    } catch (error) {
      console.error(`[${platform.name}] failed:`, error.message);
      return extra.reply(`Could not open ${platform.label} search: ${error.message}`);
    }
  }
}));

module.exports = DOWNLOADER_COMMANDS;

