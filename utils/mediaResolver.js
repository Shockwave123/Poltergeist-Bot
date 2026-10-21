/**
 * mediaResolver — resolves real, playable/downloadable media from public links,
 * search terms, and music-service links using only keyless, verified providers.
 *
 * Verified providers (Oct 2026):
 *   - YouTube search/audio/video : yt-search + watch-page player + yt-dlp (JS challenges enabled)
 *   - TikTok (video/audio/cover) : www.tikwm.com/api
 *   - Instagram (post/reel)      : oEmbed + public page / embed-page scraping
 *   - Facebook / fb.watch        : facebook.com/plugins/video.php scraping
 *   - Twitter/X                  : api.fxtwitter.com
 *   - SoundCloud (search/stream) : api-v2.soundcloud.com with dynamic client id
 *   - Pinterest / MediaFire / GoFile : public page scraping
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
const ytDlp = require('yt-dlp-exec');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

/** Read a <meta> tag's content by property/name, regardless of attribute order. */
function metaTagValue(html, key) {
  const tag = String(html || '').match(new RegExp(`<meta[^>]*(?:property|name)=["']${key}["'][^>]*>`, 'i'))?.[0];
  return tag ? (tag.match(/content=["']([^"']+)["']/i)?.[1] || null) : null;
}

/* ------------------------------ YouTube ------------------------------ */

const INNERTUBE_CLIENTS = [
  { name: 'WEB', context: { clientName: 'WEB', clientVersion: '2.20240304.00.00', hl: 'en', gl: 'US' }, key: process.env.YOUTUBE_API_KEY_WEB || 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8' },
  { name: 'ANDROID', context: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'en', gl: 'US' }, key: process.env.YOUTUBE_API_KEY_ANDROID || 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w' },
  { name: 'IOS', context: { clientName: 'IOS', clientVersion: '19.09.3', deviceMake: 'Apple', deviceModel: 'iPhone16,2', hl: 'en', gl: 'US' }, key: process.env.YOUTUBE_API_KEY_IOS || 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc' },
  { name: 'TVHTML5', context: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'en', gl: 'US' }, key: process.env.YOUTUBE_API_KEY_TV || 'AIzaSyDCU8hBy_m-8Ed1SUUoVAkywOz2IMwClMw' }
];

function decodeSignature() {
  // YouTube signature ciphers can only be decrypted by executing their JS.
  // Returning null makes pickAudioFormat/pickVideoFormat fall back to yt-dlp,
  // which solves the ciphers itself (with --js-runtimes node).
  return null;
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
  const id = youtubeId(url);
  // Use the actual video ID from the provided link. Never run a search that
  // could return a different / similar song.
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    throw new Error('Could not extract a YouTube video ID from that link.');
  }
  const targetUrl = `https://youtu.be/${id}`;

  // Primary: yt-dlp-exec solves signature ciphers and returns the FULL stream.
  try {
    return await youtubeDlAudio(targetUrl);
  } catch (dlError) {
    console.error('[youtubeAudio] yt-dlp failed, falling back to player parser:', dlError.message);
  }

  // Fallback: inline player-response parser (no cipher solving).
  const { formats, details } = await getPlayerFormats(id);
  const pick = pickAudioFormat(formats);
  if (!pick) throw new Error('Could not resolve a playable YouTube audio stream.');
  const title = details?.title || 'audio';
  const author = details?.author || '';
  const thumbnail = details?.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
  const duration = Number(details?.lengthSeconds || 0);
  const ext = /webm|opus/i.test(pick.mimeType) ? 'webm' : 'm4a';
  return {
    title,
    author,
    thumbnail,
    duration,
    source: targetUrl,
    url: pick.url,
    mimetype: pick.mimeType || 'audio/webm',
    contentLength: pick.contentLength,
    filename: `${cleanName(title)}.${ext}`
  };
}

async function youtubeVideo(url, quality = '720p') {
  const id = youtubeId(url);
  // Use the actual video ID from the provided link. Never run a search that
  // could return a different / similar song.
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    throw new Error('Could not extract a YouTube video ID from that link.');
  }
  const targetUrl = `https://youtu.be/${id}`;

  // Primary: yt-dlp-exec solves signature ciphers and returns the FULL stream.
  try {
    return await youtubeDlVideo(targetUrl, quality);
  } catch (dlError) {
    console.error('[youtubeVideo] yt-dlp failed, falling back to player parser:', dlError.message);
  }

  // Fallback: inline player-response parser.
  const { formats, details } = await getPlayerFormats(id);
  const pick = pickVideoFormat(formats, quality);
  if (!pick) throw new Error('Could not resolve a playable YouTube video stream.');
  const title = details?.title || 'video';
  const author = details?.author || '';
  const thumbnail = details?.videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
  const duration = Number(details?.lengthSeconds || 0);
  return {
    title,
    author,
    thumbnail,
    duration,
    quality: `${pick.height}p`,
    source: targetUrl,
    url: pick.url,
    mimetype: pick.mimeType || 'video/mp4',
    contentLength: pick.contentLength,
    filename: `${cleanName(title)}.mp4`
  };
}


/* ------------------------------- YouTube (yt-dlp-exec fallback) ------------------------------ */

let ytDlpFfmpegPath = 'ffmpeg';
try {
  ytDlpFfmpegPath = require('ffmpeg-static') || 'ffmpeg';
} catch { /* use system ffmpeg */ }

/**
 * Run yt-dlp-exec with dump-json to extract format info without downloading.
 */
async function ytDlpInfo(url, extraFlags = {}) {
  return ytDlp(url, {
    'dump-json': true,
    'skip-download': true,
    // YouTube serves JS challenges; let yt-dlp solve them with the local Node runtime.
    'js-runtimes': 'node',
    'remote-components': 'ejs:github',
    ...extraFlags
  });
}

/**
 * Resolve YouTube audio via yt-dlp-exec. Handles signatureCipher formats
 * that the inline player-response parser cannot decrypt.
 */
async function youtubeDlAudio(url) {
  const info = await ytDlpInfo(url, {
    format: 'ba[ext=m4a]/ba[ext=webm]/ba[ext=mp3]/ba'
  });
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const best = formats
    .filter((f) => f.acodec && f.acodec !== 'none' && f.url)
    .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
  if (!best) throw new Error('yt-dlp: no downloadable audio stream found');
  const ext = best.ext || 'm4a';
  return {
    title: info.title || 'audio',
    author: info.uploader || info.artist || '',
    thumbnail: info.thumbnail || '',
    duration: info.duration || 0,
    source: url,
    url: best.url,
    mimetype: ext === 'webm' ? 'audio/webm' : 'audio/mp4',
    contentLength: best.filesize || best.filesize_approx || 0,
    filename: `${cleanName(info.title || 'audio')}.${ext}`
  };
}

/**
 * Resolve YouTube video via yt-dlp-exec. Tries a single progressive stream
 * first; if only DASH separate streams exist, downloads video+audio and
 * merges them with ffmpeg-static.
 */
async function youtubeDlVideo(url, quality = '720p') {
  const height = parseInt(String(quality).replace(/[^0-9]/g, ''), 10) || 720;

  // Try a single progressive file first (has both video + audio)
  try {
    const info = await ytDlpInfo(url, {
      format: `best[height<=${height}][ext=mp4]/best[height<=${height}]/best`
    });
    const formats = Array.isArray(info.formats) ? info.formats : [];
    const progressive = formats
      .filter((f) => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none' && f.url)
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
    if (progressive) {
      return {
        title: info.title || 'video',
        author: info.uploader || '',
        thumbnail: info.thumbnail || '',
        duration: info.duration || 0,
        quality: `${progressive.height || height}p`,
        source: url,
        url: progressive.url,
        mimetype: `video/${progressive.ext || 'mp4'}`,
        contentLength: progressive.filesize || progressive.filesize_approx || 0,
        filename: `${cleanName(info.title || 'video')}.${progressive.ext || 'mp4'}`
      };
    }
  } catch (err) {
    // Fall through to DASH merge below
    console.error('[yt-dlp video progressive] failed:', err.message);
  }

  // DASH: download best video + best audio separately, then merge with ffmpeg
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const videoPath = path.join(tempDir, `yt_video_${Date.now()}.mp4`);
  const audioPath = path.join(tempDir, `yt_audio_${Date.now()}.m4a`);
  const outputPath = path.join(tempDir, `yt_merged_${Date.now()}.mp4`);

  try {
    await ytDlp(url, {
      format: `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best`,
      output: videoPath,
      'merge-output-format': 'mp4',
      'js-runtimes': 'node',
      'remote-components': 'ejs:github'
    });

    // yt-dlp with merge-output-format should produce outputPath directly
    if (fs.existsSync(outputPath)) {
      const merged = await fs.promises.readFile(outputPath);
      const info = await ytDlpInfo(url);
      return {
        title: info.title || 'video',
        author: info.uploader || '',
        thumbnail: info.thumbnail || '',
        duration: info.duration || 0,
        quality: `${height}p`,
        source: url,
        url: outputPath,
        mimetype: 'video/mp4',
        contentLength: merged.length,
        filename: `${cleanName(info.title || 'video')}.mp4`,
        _buffer: merged
      };
    }

    // If yt-dlp wrote to videoPath instead (merge failed), try manual ffmpeg merge
    if (fs.existsSync(videoPath) && fs.existsSync(audioPath)) {
      await new Promise((resolve, reject) => {
        const proc = spawn(ytDlpFfmpegPath, [
          '-y', '-i', videoPath, '-i', audioPath,
          '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
          outputPath
        ]);
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg merge exited ${code}`)));
        proc.on('error', reject);
      });
      const merged = await fs.promises.readFile(outputPath);
      const info = await ytDlpInfo(url);
      return {
        title: info.title || 'video',
        author: info.uploader || '',
        thumbnail: info.thumbnail || '',
        duration: info.duration || 0,
        quality: `${height}p`,
        source: url,
        url: outputPath,
        mimetype: 'video/mp4',
        contentLength: merged.length,
        filename: `${cleanName(info.title || 'video')}.mp4`,
        _buffer: merged
      };
    }

    throw new Error('yt-dlp: could not produce a merged video file');
  } finally {
    for (const f of [videoPath, audioPath, outputPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
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

function cleanSpotifyUrl(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete('si');
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('dl');
    return u.toString();
  } catch {
    return url;
  }
}

async function spotifyResolve(url) {
  const cleanUrl = cleanSpotifyUrl(url);

  let title = 'Spotify track';
  try {
    const oembed = await HTTP.get('https://open.spotify.com/oembed', {
      params: { url: cleanUrl },
      headers: { Accept: 'application/json' },
    });
    if (oembed.data && typeof oembed.data === 'object' && oembed.data.title) {
      title = oembed.data.title;
    }
  } catch {
    // oEmbed failed — fall through to itunes search
  }

  const itunes = await itunesSearch(title, 1);
  const match = itunes[0];
  if (!match) throw new Error('Could not match that Spotify item to a downloadable preview.');
  return {
    title: match.title,
    author: match.author,
    thumbnail: match.thumbnail,
    duration: match.duration,
    source: cleanUrl,
    spotifyTitle: title,
    url: match.url,
    mimetype: 'audio/mp4',
    filename: cleanName(match.title) + '.m4a'
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

const SOUNDCLOUD_KNOWN_CLIENT_IDS = ['pJaCCaoD8RMOSFmlbrbYQuyvkjP1fiES'];
let soundCloudClientId = null;
let soundCloudClientIdAt = 0;

/**
 * Resolve a working SoundCloud client id: reuse the cached one while valid,
 * validate the known list, and fall back to discovering a fresh id from
 * SoundCloud's public JS assets (they rotate ids periodically).
 */
async function getSoundCloudClientId() {
  if (soundCloudClientId && Date.now() - soundCloudClientIdAt < 12 * 60 * 60 * 1000) {
    return soundCloudClientId;
  }
  const candidates = [...SOUNDCLOUD_KNOWN_CLIENT_IDS];
  try {
    const home = await HTTP.get('https://soundcloud.com');
    const scripts = [...String(home.data || '').matchAll(/src="([^"]+\.js)"/g)]
      .map((match) => (match[1].startsWith('http') ? match[1] : `https://soundcloud.com${match[1]}`));
    for (const script of scripts.slice(0, 12)) {
      const asset = await HTTP.get(script);
      const found = String(asset.data || '').match(/client_id[=:]\s*["']([A-Za-z0-9_-]{20,})["']/);
      if (found) {
        candidates.push(found[1]);
        break;
      }
    }
  } catch { /* discovery is best effort; known ids may still work */ }
  for (const id of candidates) {
    try {
      const check = await HTTP.get('https://api-v2.soundcloud.com/search/tracks', {
        params: { q: 'test', limit: 1, client_id: id }
      });
      if (check.status === 200) {
        soundCloudClientId = id;
        soundCloudClientIdAt = Date.now();
        return id;
      }
    } catch { /* try next */ }
  }
  throw new Error('SoundCloud is temporarily unavailable (no working client id).');
}

async function soundcloudSearch(term, limit = 10) {
  const clientId = await getSoundCloudClientId();
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

/**
 * Resolve a direct progressive MP3 stream for a SoundCloud track page by
 * exchanging the track's transcoder URL for a temporary stream URL.
 */
async function soundcloudStream(url) {
  const clientId = await getSoundCloudClientId();
  const target = String(url || '').trim();
  const page = await HTTP.get(target, { maxRedirects: 5 });
  const html = String(page.data || '');
  const transcodings = JSON.parse(html.match(/"transcodings":(\[[^\]]+\])/)?.[1] || '[]');
  const progressive = transcodings.find((entry) => entry.format?.protocol === 'progressive' && entry.format?.mime_type?.includes('audio/mpeg'))
    || transcodings.find((entry) => entry.format?.protocol === 'progressive');
  if (!progressive?.url) throw new Error('No downloadable stream exists for that SoundCloud track.');
  const token = await HTTP.get(`${progressive.url}?client_id=${clientId}`);
  const streamUrl = token.data?.url;
  if (!streamUrl) throw new Error('SoundCloud refused to issue a stream URL.');
  return {
    url: streamUrl,
    title: metaTagValue(html, 'og:title') || 'SoundCloud track',
    source: target
  };
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

/* ------------------------------ Instagram ----------------------------- */

async function instagramDownload(url) {
  const target = String(url || '').trim();
  const meta = { title: null, author: null, thumbnail: null };

  // oEmbed is keyless and works for public posts; gives metadata + preview image.
  try {
    const embed = await HTTP.get('https://www.instagram.com/oembed/', { params: { url: target } });
    if (embed.status === 200 && embed.data?.title) {
      meta.title = embed.data.title;
      meta.author = embed.data.author_name;
      meta.thumbnail = embed.data.thumbnail_url;
    }
  } catch { /* best effort */ }

  const unescapeHtml = (text) => String(text || '')
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
  const findVideo = (html) => {
    const normalized = unescapeHtml(html);
    return metaTagValue(normalized, 'og:video')
      || metaTagValue(normalized, 'og:video:url')
      || normalized.match(/"video_url":"(https:[^"]+?)"/)?.[1]
      || normalized.match(/https:\/\/[^"'\s\\]+?\.mp4[^"'\s\\]*/)?.[1]
      || null;
  };
  const findImage = (html) => {
    const normalized = unescapeHtml(html);
    return metaTagValue(normalized, 'og:image') || metaTagValue(normalized, 'twitter:image');
  };

  // Public post page — og tags for photos, sometimes videos.
  let videoUrl = null;
  let imageUrl = meta.thumbnail;
  try {
    const page = await HTTP.get(target, { maxRedirects: 5 });
    const html = String(page.data || '');
    videoUrl = findVideo(html);
    imageUrl = imageUrl || findImage(html);
  } catch { /* best effort */ }

  // Embed page — served without the login wall; the most reliable video source.
  if (!videoUrl) {
    const match = target.match(/instagram\.com\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    if (match) {
      try {
        const embedPage = await HTTP.get(`https://www.instagram.com/${match[1]}/${match[2]}/embed/captioned/`, { maxRedirects: 5 });
        videoUrl = findVideo(String(embedPage.data || ''));
      } catch { /* best effort */ }
    }
  }

  if (!videoUrl && !imageUrl) {
    throw new Error('That Instagram post could not be found — it may be private or deleted.');
  }
  return {
    title: meta.title || 'Instagram media',
    author: meta.author,
    videoUrl,
    imageUrl,
    source: target
  };
}

/* ------------------------------- Facebook ----------------------------- */

async function facebookDownload(url) {
  let target = String(url || '').trim();

  // fb.watch short links: follow the redirect to the real facebook.com URL.
  if (/fb\.watch\//i.test(target)) {
    try {
      const redirect = await HTTP.get(target, { maxRedirects: 5 });
      const finalUrl = redirect.request?.res?.responseUrl || '';
      if (/facebook\.com\//i.test(finalUrl)) target = finalUrl;
    } catch { /* keep the original and hope the plugin page resolves it */ }
  }
  target = target.split('?')[0];

  // The video plugin renders without a login wall and embeds direct fbcdn mp4 URLs.
  const pluginUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(target)}&show_text=false&width=560`;
  const response = await HTTP.get(pluginUrl, { maxRedirects: 5 });
  const html = String(response.data || '')
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
  const candidates = [...new Set(
    [...html.matchAll(/https:\/\/[^"'\s\\]+?\.mp4[^"'\s\\]*/g)].map((match) => match[0])
  )];
  if (!candidates.length) {
    throw new Error('No downloadable video found for that Facebook link — it may be private or unavailable.');
  }

  // Prefer HD renditions (hd path segment or the highest mobile encoding).
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      hd: /\/hd_?\d*\/|hd_?mp4/i.test(candidate) ? 1 : 0,
      height: Number(candidate.match(/\/m(\d{3,4})\//)?.[1] || 0)
    }))
    .sort((first, second) => second.hd - first.hd || second.height - first.height);

  for (const { candidate } of ranked.slice(0, 3)) {
    try {
      const probe = await HTTP.get(candidate, {
        headers: { Range: 'bytes=0-1023' },
        responseType: 'arraybuffer',
        maxRedirects: 5
      });
      const type = String(probe.headers['content-type'] || '');
      if ([200, 206].includes(probe.status) && (type.startsWith('video/') || type.includes('octet-stream'))) {
        return { videoUrl: candidate, source: target };
      }
    } catch { /* try the next rendition */ }
  }
  throw new Error('Facebook returned a video link that could not be fetched.');
}

/* ------------------------------- Twitter/X ----------------------------- */

async function twitterDownload(url) {
  const statusPath = String(url || '').match(/(?:twitter|x)\.com(\/[A-Za-z0-9_]+\/status\/\d+)/i)?.[1];
  if (!statusPath) throw new Error('That does not look like a Twitter/X post link.');
  const response = await HTTP.get(`https://api.fxtwitter.com${statusPath}`, { maxRedirects: 5 });
  const tweet = response.data?.data?.tweet || response.data?.tweet || response.data?.data;
  const media = tweet?.media;
  if (!media) throw new Error('Could not resolve that tweet — it may be deleted or private.');
  const video = (media.type === 'video' || media.type === 'animated_gif')
    ? media.video?.url || media.videos?.[0]?.url || null
    : null;
  const images = (media.images || []).map((image) => image.url).filter(Boolean);
  if (!video && !images.length) throw new Error('That post has no downloadable media.');
  return {
    title: String(tweet.text || '').split('\n')[0].slice(0, 80),
    author: tweet.author?.screen_name,
    avatar: tweet.author?.avatar_url,
    videoUrl: video,
    imageUrl: images[0] || null,
    images,
    source: url
  };
}

/* ---------------------------- Pinterest ------------------------------ */

async function pinterestDownload(url) {
  let target = String(url || '').trim();
  // pin.it short links redirect to the real pin page.
  if (/pin\.it\//i.test(target)) {
    try {
      const redirect = await HTTP.get(target, { maxRedirects: 5 });
      const finalUrl = redirect.request?.res?.responseUrl || '';
      if (/pinterest\./i.test(finalUrl)) target = finalUrl;
    } catch { /* keep the original */ }
  }
  const response = await HTTP.get(target, { maxRedirects: 5 });
  const html = String(response.data || '')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
  // Meta tags may put content before property, so use the order-agnostic helper.
  const video = metaTagValue(html, 'og:video')
    || metaTagValue(html, 'og:video:url')
    || html.match(/"video_url":"(https:[^"]+?)"/)?.[1]
    || null;
  const image = metaTagValue(html, 'og:image')
    || html.match(/"image_large_url":"(https:[^"]+?)"/)?.[1]
    || null;
  if (!video && !image) throw new Error('Could not extract media from that Pinterest pin.');
  return { videoUrl: video || null, imageUrl: image || null, source: target };
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
  const contentId = String(url).split('/d/')[1]?.split('/')[0];
  if (!contentId) throw new Error('That does not look like a GoFile link.');
  const tokenResponse = await HTTP.get('https://api.gofile.io/servers');
  const server = tokenResponse.data?.data?.servers?.[0]?.name;
  if (!server) throw new Error('GoFile is unavailable right now.');

  // The current API requires an account token; anonymous accounts are free.
  let token = null;
  try {
    const account = await HTTP.post('https://api.gofile.io/accounts');
    token = account.data?.data?.token || null;
  } catch { /* try without */ }
  const headers = token ? { Authorization: `Bearer ${token}` } : { 'User-Agent': UA };

  // Preferred: dedicated directlinks endpoint.
  const direct = await HTTP.get(`https://${server}.gofile.io/contents/${contentId}/directlinks`, { headers });
  const link = (Array.isArray(direct.data?.data?.links) ? direct.data.data.links : [])
    .find((entry) => entry.link);
  if (link?.link) return { url: link.link, source: url };

  // Fallback: classic contents listing.
  const plain = await HTTP.get(`https://${server}.gofile.io/contents/${contentId}`, { headers });
  const file = Object.values(plain.data?.data?.contents || {})
    .find((entry) => entry.type === 'file' && (entry.link || entry.directLink));
  if (!file) throw new Error('Could not locate a file in that GoFile folder — it may have expired.');
  return { url: file.directLink || file.link, filename: file.name, size: file.size, source: url };
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
  youtubeDlAudio,
  youtubeDlVideo,
  tiktokDownload,
  instagramDownload,
  facebookDownload,
  twitterDownload,
  spotifyResolve,
  itunesSearch,
  resolveMusic,
  deezerSearch,
  audiomackSearch,
  soundcloudSearch,
  soundcloudStream,
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

