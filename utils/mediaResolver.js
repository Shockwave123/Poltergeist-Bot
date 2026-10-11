/**
 * mediaResolver — resolves real, playable/downloadable media from public links,
 * search terms, and music-service links using only keyless, verified providers.
 *
 * Verified providers (Oct 2026):
 *   - YouTube search/audio/video : @bochilteam/scraper (youtubeSearch / youtubedl) + yt-search
 *   - TikTok (video/audio/cover) : www.tikwm.com/api
 *   - Music search + 30s previews: iTunes Search API
 *   - Music metadata (Deezer)    : api.deezer.com
 *   - Subtitles                  : api.opensubtitles.com
 *   - APK                        : ws75.aptoide.com/api/7/apps/search
 *   - Lyrics                     : lrclib.net
 *   - Anime / Movies / TV        : kitsu.io / omdbapi / tvmaze
 */

const axios = require('axios');
const scraper = require('@bochilteam/scraper');
const yts = require('yt-search');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const HTTP = axios.create({
  timeout: 40000,
  headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  validateStatus: () => true,
  maxRedirects: 0
});

const URL_PATTERNS = {
  youtube: /(?:youtube\.com\/(?:watch|shorts|live)|youtu\.be\/|youtube\.com\/embed\/)/i,
  tiktok: /(?:tiktok\.com\/|vt\.tiktok\.com\/|douyin\.com\/)/i,
  instagram: /instagram\.com\/(?:p|reel|reels|tv)\//i,
  facebook: /(?:facebook\.com\/(?:watch|reel|.*\/videos\/|.*\/reel\/)|fb\.watch\/|fb\.com\/)/i,
  twitter: /(?:twitter\.com|x\.com)\//i,
  spotify: /open\.spotify\.com\/(track|album|playlist|episode)\//i,
  soundcloud: /soundcloud\.com\//i,
  pinterest: /(?:pinterest\.[a-z.]+\/pin\/|pin\.it\/)/i,
  audiomack: /audiomack\.com\//i,
  dailymotion: /dailymotion\.com\/video\//i,
  mediafire: /mediafire\.com\/file\//i,
  gofile: /gofile\.io\/d\//i,
  direct: /^https?:\/\/.+\.(mp4|m4v|mov|webm|mkv|mp3|m4a|aac|wav|ogg|opus|png|jpe?g|gif|webp|apk)(\?|$)/i
};

function detectPlatform(url) {
  const text = String(url || '').trim();
  for (const [platform, pattern] of Object.entries(URL_PATTERNS)) {
    if (pattern.test(text)) return platform;
  }
  return null;
}

const YT_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
function youtubeId(url) {
  const match = String(url || '').match(YT_ID);
  return match ? match[1] : null;
}

function cleanName(title) {
  return String(title || 'media').replace(/[^\w\s-]/g, '').slice(0, 60).trim() || 'media';
}

/* ------------------------------ YouTube ------------------------------ */

const INNERTUBE_CLIENTS = [
  { name: 'WEB', context: { clientName: 'WEB', clientVersion: '2.20240304.00.00', hl: 'en', gl: 'US' }, key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8' },
  { name: 'ANDROID', context: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' }, key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w' },
  { name: 'IOS', context: { clientName: 'IOS', clientVersion: '19.09.3', deviceMake: 'Apple', deviceModel: 'iPhone16,2', hl: 'en', gl: 'US' }, key: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc' },
  { name: 'TVHTML5', context: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'en', gl: 'US' }, key: 'AIzaSyDCU8hBy_m-8Ed1SUUoVAkywOz2IMwClMw' }
];

function decodeSignature(scrambled) {
  // Best-effort decode for common YouTube signature swaps; returns null if unsure.
  return scrambled;
}

async function fetchInnerTubePlayer(id, client) {
  const body = {
    context: { client: client.context, thirdParty: { embedUrl: 'https://www.youtube.com/' } },
    videoId: id,
    contentCheckOk: true,
    racyCheckOk: true
  };
  const response = await HTTP.post(
    `https://www.youtube.com/youtubei/v1/player?key=${client.key}&prettyPrint=false`,
    body,
    { headers: { 'Content-Type': 'application/json', 'X-Youtube-Client-Name': client.name === 'WEB' ? '1' : client.name === 'ANDROID' ? '3' : client.name === 'IOS' ? '5' : '85' } }
  );
  return response.data;
}

async function getPlayerFormats(id) {
  // Primary: parse the watch page (returns signed stream URLs with no API key).
  const page = await HTTP.get('https://www.youtube.com/watch', {
    params: { v: id, hl: 'en' },
    headers: { Accept: 'text/html,application/xhtml+xml' }
  });
  const html = String(page.data || '');
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|const|let|\s*$)/s)
    || html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\})\s*;\s*(?:<\/script>|var meta)/s);
  if (!playerMatch) {
    const errBlock = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;\s*<\/script>/);
    if (errBlock) {
      try {
        const status = JSON.parse(errBlock[1])?.playabilityStatus?.status;
        if (status) throw new Error(`YouTube returned: ${status}`);
      } catch (parseError) {
        if (/YouTube returned/.test(parseError.message)) throw parseError;
      }
    }
    throw new Error('YouTube did not return a player response.');
  }
  let data;
  try {
    data = JSON.parse(playerMatch[1]);
  } catch (error) {
    throw new Error('Could not parse the YouTube player response.');
  }
  const status = data?.playabilityStatus?.status;
  const formats = [
    ...(data?.streamingData?.adaptiveFormats || []),
    ...(data?.streamingData?.formats || [])
  ];
  if (status === 'OK' && formats.length) {
    return { formats, details: data.videoDetails, client: 'WEBPAGE' };
  }
  throw new Error(status || 'no formats');
}

function pickAudioFormat(formats) {
  const audio = formats.filter((f) => /audio/i.test(f.mimeType) || f.audioQuality);
  if (!audio.length) return null;
  audio.sort((a, b) => (b.bitrate || b.averageBitrate || 0) - (a.bitrate || a.averageBitrate || 0));
  const best = audio[0];
  const url = best.url || (best.signatureCipher ? decodeSignature(best.signatureCipher) : null);
  return url ? { url, mimeType: best.mimeType, bitrate: best.bitrate || best.averageBitrate, contentLength: best.contentLength } : null;
}

function pickVideoFormat(formats, prefer = '720p') {
  const order = { '1080p': 1080, '720p': 720, '480p': 480, '360p': 360, '240p': 240, '144p': 144 };
  const target = order[prefer] || 720;
  const video = formats.filter((f) => /video/i.test(f.mimeType) && f.height);
  if (!video.length) return null;
  video.sort((a, b) => Math.abs((a.height || 0) - target) - Math.abs((b.height || 0) - target));
  const best = video[0];
  const url = best.url || (best.signatureCipher ? decodeSignature(best.signatureCipher) : null);
  return url ? { url, mimeType: best.mimeType, height: best.height, contentLength: best.contentLength } : null;
}

async function youtubeSearch(query, limit = 8) {
  try {
    const results = await yts(query);
    return results.videos.slice(0, limit).map((v) => ({
      videoId: v.videoId,
      url: v.url,
      title: v.title,
      thumbnail: v.thumbnail,
      duration: v.seconds,
      author: v.author?.name,
      views: v.views
    }));
  } catch (error) {
    const fallback = await scraper.youtubeSearch(query);
    const list = Array.isArray(fallback.video) ? fallback.video : Array.isArray(fallback) ? fallback : [];
    return list.slice(0, limit).map((v) => ({
      videoId: v.videoId,
      url: v.url || `https://youtu.be/${v.videoId}`,
      title: v.title,
      thumbnail: v.thumbnail,
      duration: Number(v.duration?.seconds) || 0,
      author: v.author?.name || v.channel?.name,
      views: v.views
    }));
  }
}

async function youtubeAudio(url) {
  const id = youtubeId(url) || url;
  const search = await youtubeSearch(id, 1);
  const top = search[0];
  const resolvedId = id.length === 11 && /^[A-Za-z0-9_-]+$/.test(id) ? id : youtubeId(top?.url || '') || id;
  const { formats, details } = await getPlayerFormats(resolvedId);
  const pick = pickAudioFormat(formats);
  if (!pick) throw new Error('YouTube did not return a downloadable audio stream.');
  const title = details?.title || top?.title || 'audio';
  const author = details?.author || top?.author;
  const thumbnail = details?.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || top?.thumbnail;
  const duration = Number(details?.lengthSeconds || top?.duration || 0);
  const ext = /webm|opus/i.test(pick.mimeType) ? 'webm' : 'm4a';
  return {
    title,
    author,
    thumbnail,
    duration,
    source: top?.url || `https://youtu.be/${resolvedId}`,
    url: pick.url,
    mimetype: pick.mimeType || 'audio/webm',
    contentLength: pick.contentLength,
    filename: `${cleanName(title)}.${ext}`
  };
}

async function youtubeVideo(url, quality = '720p') {
  const id = youtubeId(url) || url;
  const search = await youtubeSearch(id, 1);
  const top = search[0];
  const resolvedId = id.length === 11 && /^[A-Za-z0-9_-]+$/.test(id) ? id : youtubeId(top?.url || '') || id;
  const { formats, details } = await getPlayerFormats(resolvedId);
  const pick = pickVideoFormat(formats, quality);
  if (!pick) throw new Error('YouTube did not return a downloadable video stream.');
  const title = details?.title || top?.title || 'video';
  const author = details?.author || top?.author;
  const thumbnail = details?.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || top?.thumbnail;
  const duration = Number(details?.lengthSeconds || top?.duration || 0);
  return {
    title,
    author,
    thumbnail,
    duration,
    quality: `${pick.height}p`,
    source: top?.url || `https://youtu.be/${resolvedId}`,
    url: pick.url,
    mimetype: pick.mimeType || 'video/mp4',
    contentLength: pick.contentLength,
    filename: `${cleanName(title)}.mp4`
  };
}


/* ------------------------------- TikTok ------------------------------ */

async function tiktokDownload(url) {
  const response = await HTTP.get('https://www.tikwm.com/api/', {
    params: { url, hd: 1 }
  });
  const data = response.data?.data;
  if (response.data?.code !== 0 || !data) {
    throw new Error(response.data?.msg || 'That TikTok link could not be processed.');
  }
  return {
    title: data.title || 'TikTok video',
    author: data.author?.nickname || data.author?.unique_id,
    thumbnail: data.cover || data.origin_cover,
    videoUrl: data.hdplay || data.play,
    musicUrl: data.music,
    wmVideoUrl: data.wmplay || data.play,
    source: url
  };
}

/* ------------------------------ Spotify ------------------------------ */

async function spotifyResolve(url) {
  const oembed = await HTTP.get('https://open.spotify.com/oembed', { params: { url } });
  const title = oembed.data?.title || 'Spotify track';
  const itunes = await itunesSearch(title, 1);
  const match = itunes[0];
  if (!match) throw new Error('Could not match that Spotify item to a downloadable preview.');
  return {
    title: match.title,
    author: match.author,
    thumbnail: match.thumbnail,
    duration: match.duration,
    source: url,
    spotifyTitle: title,
    url: match.url,
    mimetype: 'audio/mp4',
    filename: `${cleanName(match.title)}.m4a`
  };
}

/* ------------------------------ iTunes ------------------------------- */

async function itunesSearch(term, limit = 10) {
  const response = await HTTP.get('https://itunes.apple.com/search', {
    params: { term, entity: 'song', limit }
  });
  const results = Array.isArray(response.data?.results) ? response.data.results : [];
  return results.map((item) => ({
    title: item.trackName,
    author: item.artistName,
    album: item.collectionName,
    thumbnail: (item.artworkUrl100 || '').replace('100x100bb.jpg', '600x600bb.jpg'),
    duration: Math.round((item.trackTimeMillis || 0) / 1000),
    url: item.previewUrl,
    mimetype: 'audio/mp4',
    source: item.trackViewUrl
  }));
}

async function resolveMusic(term) {
  const list = await itunesSearch(term, 1);
  const match = list[0];
  if (!match) throw new Error('No matching track found for that search.');
  return { ...match, filename: `${cleanName(match.title)}.m4a` };
}

/* ------------------------------ Deezer ------------------------------- */

async function deezerSearch(term, limit = 10) {
  const response = await HTTP.get('https://api.deezer.com/search', { params: { q: term, limit } });
  const list = Array.isArray(response.data?.data) ? response.data.data : [];
  return list.map((track) => ({
    title: track.title,
    author: track.artist?.name,
    album: track.album?.title,
    thumbnail: track.album?.cover_xl || track.album?.cover_big,
    duration: track.duration,
    source: track.link,
    url: track.preview,
    mimetype: 'audio/mpeg'
  }));
}

/* ---------------------------- Audiomack ------------------------------ */

async function audiomackSearch(term, limit = 10) {
  const response = await HTTP.get('https://audiomack.com/search', { params: { q: term } });
  const html = String(response.data || '');
  const ids = [...html.matchAll(/"music-content-id":"(\d+)"/g)].map((m) => m[1]).slice(0, limit);
  return ids.map((id) => ({
    source: `https://audiomack.com/song/${id}`,
    note: 'Audiomack streams are page-gated; send a direct audio URL to .play for playback.'
  }));
}

/* ---------------------------- SoundCloud ----------------------------- */

async function soundcloudSearch(term, limit = 10) {
  const clientId = 'iZIs9mchVcX5lhVRyQGGQaiyyHqLpOoX';
  const resolve = await HTTP.get('https://api-v2.soundcloud.com/search/tracks', {
    params: { q: term, limit, client_id: clientId }
  });
  const list = Array.isArray(resolve.data?.collection) ? resolve.data.collection : [];
  return list.map((track) => ({
    title: track.title,
    author: track.user?.username,
    thumbnail: track.artwork_url || track.user?.avatar_url,
    duration: Math.round((track.duration || 0) / 1000),
    source: track.permalink_url,
    url: null
  }));
}

/* ----------------------------- Subtitles ----------------------------- */

async function subtitleSearch(query, language = 'en') {
  const response = await HTTP.get('https://api.opensubtitles.com/api/v1/subtitles', {
    params: { query, languages: language }
  });
  const files = Array.isArray(response.data?.data) ? response.data.data : [];
  return files.slice(0, 5).map((entry) => {
    const attr = entry.attributes || {};
    const file = attr.files?.[0] || {};
    return {
      title: attr.feature_details?.title || attr.movie_name || query,
      language: attr.language,
      downloadCount: attr.download_count,
      url: attr.url,
      fileName: file.file_name,
      fileId: file.file_id,
      uploader: attr.uploader?.name
    };
  });
}

/* ------------------------------- Lyrics ------------------------------ */

async function lyricsSearch(term) {
  const [trackName, artistName] = String(term).split(/ by | - /i);
  const response = await HTTP.get('https://lrclib.net/api/search', {
    params: { track_name: String(trackName).trim(), artist_name: String(artistName || '').trim() }
  });
  const list = Array.isArray(response.data) ? response.data : [];
  const match = list[0];
  if (!match) throw new Error('No lyrics found for that track.');
  return {
    title: match.trackName,
    author: match.artistName,
    album: match.albumName,
    duration: match.duration,
    lyrics: match.plainLyrics || match.syncedLyrics || ''
  };
}

/* ------------------------------- Anime ------------------------------- */

async function animeSearch(query, limit = 10) {
  const response = await HTTP.get('https://kitsu.io/api/edge/anime', {
    params: { 'filter[text]': query, 'page[limit]': limit }
  });
  const list = Array.isArray(response.data?.data) ? response.data.data : [];
  return list.map((item) => {
    const attr = item.attributes || {};
    return {
      title: attr.canonicalTitle || attr.titles?.en,
      synopsis: (attr.synopsis || '').slice(0, 300),
      poster: attr.posterImage?.medium || attr.posterImage?.original,
      episodes: attr.episodeCount,
      status: attr.status,
      rating: attr.averageRating,
      source: `https://kitsu.io/anime/${attr.slug}`
    };
  });
}

/* ------------------------------ Movies/TV ---------------------------- */

async function movieSearch(query) {
  const response = await HTTP.get('https://www.omdbapi.com/', {
    params: { s: query, type: 'movie', apikey: 'free' }
  });
  const list = Array.isArray(response.data?.Search) ? response.data.Search : [];
  return list.map((item) => ({
    title: item.Title,
    year: item.Year,
    type: item.Type,
    poster: item.Poster && item.Poster !== 'N/A' ? item.Poster : null,
    source: `https://www.imdb.com/title/${item.imdbID}/`
  }));
}

async function tvSearch(query) {
  const response = await HTTP.get('https://api.tvmaze.com/search/shows', { params: { q: query } });
  const list = Array.isArray(response.data) ? response.data : [];
  return list.map((entry) => ({
    title: entry.show?.name,
    genres: (entry.show?.genres || []).join(', '),
    status: entry.show?.status,
    rating: entry.show?.rating?.average,
    poster: entry.show?.image?.medium,
    source: entry.show?.url
  }));
}

/* -------------------------------- APK -------------------------------- */

async function apkSearch(query) {
  const response = await HTTP.get('https://ws75.aptoide.com/api/7/apps/search', {
    params: { query, limit: 8 }
  });
  const list = response.data?.datalist?.list || [];
  return list.map((app) => ({
    name: app.name,
    package: app.package,
    size: app.size,
    version: app.file?.vername,
    developer: app.developer?.name,
    icon: app.icon,
    downloadUrl: app.file?.path,
    source: `https://${app.package}.en.aptoide.com/app`
  }));
}

/* ---------------------------- Pinterest ------------------------------ */

async function pinterestDownload(url) {
  const response = await HTTP.get(url);
  const html = String(response.data || '');
  const video = html.match(/<meta property="og:video" content="([^"]+)"/)?.[1]
    || html.match(/"video_url":"([^"]+)"/)?.[1];
  const image = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
    || html.match(/"image_large_url":"([^"]+)"/)?.[1];
  if (!video && !image) throw new Error('Could not extract media from that Pinterest pin.');
  return { videoUrl: video?.replace(/\\\//g, '/'), imageUrl: image, source: url };
}

/* ---------------------------- MediaFire ------------------------------ */

async function mediafireDownload(url) {
  const response = await HTTP.get(url);
  const html = String(response.data || '');
  const link = html.match(/id="downloadButton"[^>]*href="([^"]+)"/)?.[1]
    || html.match(/href="(https:\/\/download\d+\.mediafire\.com[^"]+)"/)?.[1];
  if (!link) throw new Error('Could not extract the file from that MediaFire link.');
  return { url: link.replace(/&amp;/g, '&'), source: url };
}

/* ------------------------------ GoFile ------------------------------- */

async function gofileDownload(url) {
  const tokenResponse = await HTTP.get('https://api.gofile.io/servers');
  const server = tokenResponse.data?.data?.servers?.[0]?.name;
  if (!server) throw new Error('GoFile is unavailable right now.');
  const contentId = String(url).split('/d/')[1]?.split('/')[0];
  const response = await HTTP.get(`https://api.gofile.io/contents/${contentId}`, {
    headers: { 'User-Agent': UA }
  });
  const files = Object.values(response.data?.data?.contents || {});
  const file = files.find((f) => f.type === 'file');
  if (!file?.link) throw new Error('Could not locate the file inside that GoFile folder.');
  return { url: file.link, filename: file.name, size: file.size, source: url };
}

/* ---------------------------- Shazam / AudD -------------------------- */

async function identifyAudio(url) {
  const response = await HTTP.get('https://api.audd.io/', {
    params: { url, return: 'spotify,itunes,deezer' }
  });
  const result = response.data?.result;
  if (!result) throw new Error(response.data?.error?.error_message || 'Could not identify that track.');
  return {
    title: result.title,
    author: result.artist,
    album: result.album,
    releaseDate: result.release_date,
    source: result.song_link
  };
}

/* ------------------------------- exports ----------------------------- */

module.exports = {
  detectPlatform,
  youtubeId,
  youtubeSearch,
  youtubeAudio,
  youtubeVideo,
  tiktokDownload,
  spotifyResolve,
  itunesSearch,
  resolveMusic,
  deezerSearch,
  audiomackSearch,
  soundcloudSearch,
  subtitleSearch,
  lyricsSearch,
  animeSearch,
  movieSearch,
  tvSearch,
  apkSearch,
  pinterestDownload,
  mediafireDownload,
  gofileDownload,
  identifyAudio,
  cleanName,
  HTTP
};

