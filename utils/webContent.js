const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const axios = require('axios');
const cheerio = require('cheerio');

const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const ALLOWED_PORTS = new Set(['', '80', '443']);

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;
    if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
    if (first === 169 && second === 254) return false;
    if (first === 172 && second >= 16 && second <= 31) return false;
    if (first === 192 && second === 168) return false;
    if (first === 100 && second >= 64 && second <= 127) return false;
    if (first === 198 && (second === 18 || second === 19)) return false;
    if (first === 192 && second === 0) return false;
    return true;
  }
  if (family === 6) {
    const normalized = address.toLowerCase().split('%')[0];
    return normalized.startsWith('2') || normalized.startsWith('3');
  }
  return false;
}

function normalizeHost(host) {
  return String(host || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

async function resolvePublicHost(host) {
  const normalized = normalizeHost(host);
  const family = net.isIP(normalized);
  if (family) {
    if (!isPublicAddress(normalized)) throw new Error('Private and reserved network addresses cannot be fetched.');
    return [{ address: normalized, family }];
  }
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) {
    throw new Error('This link does not point to a public website.');
  }

  const addresses = await dns.lookup(normalized, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('This link does not resolve to a public website.');
  }
  return addresses;
}

function createPinnedAgent(url, addresses) {
  const expectedHost = normalizeHost(url.hostname);
  const lookup = (hostname, options, callback) => {
    if (normalizeHost(hostname) !== expectedHost) {
      callback(new Error('Unexpected network host while fetching link.'));
      return;
    }
    if (options?.all) {
      callback(null, addresses);
      return;
    }
    callback(null, addresses[0].address, addresses[0].family);
  };
  return url.protocol === 'https:'
    ? new https.Agent({ lookup })
    : new http.Agent({ lookup });
}

async function fetchPublicUrl(urlText, { maxBytes = MAX_HTML_BYTES, accept = '*/*' } = {}) {
  let current;
  try {
    current = new URL(urlText);
  } catch (error) {
    throw new Error('Enter a complete http or https link.');
  }
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (!['http:', 'https:'].includes(current.protocol) || current.username || current.password || !ALLOWED_PORTS.has(current.port)) {
      throw new Error('Only public http or https links on standard ports can be fetched.');
    }
    const addresses = await resolvePublicHost(current.hostname);
    const agent = createPinnedAgent(current, addresses);
    let response;
    try {
      response = await axios.get(current.href, {
        httpAgent: current.protocol === 'http:' ? agent : undefined,
        httpsAgent: current.protocol === 'https:' ? agent : undefined,
        proxy: false,
        maxRedirects: 0,
        maxContentLength: maxBytes,
        timeout: 20000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
        headers: { 'user-agent': 'PoltergeistBot/1.0', accept }
      });
    } catch (error) {
      agent.destroy();
      throw new Error(`Could not fetch the page: ${error.message}`);
    }
    agent.destroy();

    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      if (redirect === MAX_REDIRECTS) throw new Error('The page redirected too many times.');
      current = new URL(response.headers.location, current);
      if (!['http:', 'https:'].includes(current.protocol)) throw new Error('The page redirected to an unsupported URL.');
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`The page returned HTTP ${response.status}.`);
    }
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    const buffer = Buffer.from(response.data);
    if (buffer.length > maxBytes) throw new Error(`The downloaded file exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
    return { buffer, headers: response.headers, url: current.href, contentType };
  }
  throw new Error('Could not fetch the page.');
}

async function fetchHtml(urlText) {
  const response = await fetchPublicUrl(urlText, {
    maxBytes: MAX_HTML_BYTES,
    accept: 'text/html,application/xhtml+xml'
  });
  if (!response.contentType.includes('text/html') && !response.contentType.includes('application/xhtml+xml')) {
    throw new Error('That link is not an HTML article page.');
  }
  return { html: response.buffer.toString('utf8'), url: response.url };
}

async function fetchWebPageText(urlText, maxCharacters = 16000) {
  const { html, url } = await fetchHtml(urlText);
  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('title').first().text() || '';
  $('script, style, noscript, nav, header, footer, aside, form, button, svg, iframe, .advertisement, .ad').remove();
  const article = $('article').first().text() || $('[role="main"]').first().text() || $('main').first().text() || $('body').text();
  const text = String(article).replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('No readable article text was found on that page.');
  return {
    title: String(title).replace(/\s+/g, ' ').trim().slice(0, 300),
    text: text.slice(0, maxCharacters),
    truncated: text.length > maxCharacters,
    url
  };
}

module.exports = { fetchPublicUrl, fetchWebPageText, isPublicAddress, resolvePublicHost };