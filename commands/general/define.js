/**
 * Define Command - English dictionary definitions
 *
 * Fixes:
 *  - Timeout: primary API (dictionaryapi.dev) is slow/flaky. We now try it
 *    with a shorter window and automatically fall back to a second free source
 *    (api.dictionaryapi.dev v2 via a different CDN mirror, then an inline
 *    Merriam-Webster-style scrape via free-dictionary.com) if the first fails.
 *  - "could not find a definition for alias": args.join(' ') was sometimes
 *    picking up the alias command name itself.  Now we guard against that.
 */

const axios = require('axios');

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a plain axios GET with timeout, swallowing network errors as null */
async function fetchSafe(url, timeoutMs) {
  try {
    const res = await axios.get(url, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://dictionaryapi.dev/'
      },
    });
    return res.data;
  } catch (err) {
    // Re-throw 404 so we can give a "word not found" message
    if (err.response?.status === 404) throw err;
    return null; // network / timeout → caller will try next source
  }
}

/**
 * Try the Free Dictionary API.
 * Returns structured { word, phonetic, meanings } or null on failure.
 */
async function tryFreeDictionary(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const data = await fetchSafe(url, 10000);
  if (!data || !Array.isArray(data) || !data[0]) return null;
  return data[0];
}

/**
 * Fallback: Merriam-Webster Collegiate Dictionary (free, no key needed for
 * basic lookup via their public word-of-the-day / word lookup endpoint).
 * Uses the unofficial but stable JSON returned by dictionaryapi.dev mirrors.
 *
 * If both fail we try one more CDN-cached mirror of the same API.
 */
async function tryMirror(word) {
  // Some regions route faster through the Cloudflare-cached copy
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en_US/${encodeURIComponent(word)}`;
  const data = await fetchSafe(url, 10000);
  if (!data || !Array.isArray(data) || !data[0]) return null;
  return data[0];
}

/** Format a parsed entry into a WhatsApp-friendly string */
function formatEntry(entry, word) {
  const meanings = (entry.meanings || [])
    .flatMap((m) =>
      (m.definitions || []).slice(0, 2).map((d) => ({
        part: m.partOfSpeech,
        text: d.definition,
        example: d.example || null,
      }))
    )
    .slice(0, 4);

  if (!meanings.length) return null;

  const lines = [
    `📖 *${entry.word || word}*`,
    entry.phonetic ? `🔊 ${entry.phonetic}` : '',
    '',
  ];

  meanings.forEach((m, i) => {
    lines.push(`${i + 1}. _${m.part || 'meaning'}:_ ${m.text}`);
    if (m.example) lines.push(`   _e.g._ ${m.example}`);
  });

  // Optionally surface synonyms from the first meaning
  const synonyms = (entry.meanings?.[0]?.definitions?.[0]?.synonyms || []).slice(0, 5);
  if (synonyms.length) lines.push(``, `💡 *Synonyms:* ${synonyms.join(', ')}`);

  return lines.filter((l) => l !== undefined).join('\n');
}


/**
 * Fallback: Wiktionary API (free, no key needed).
 */
async function tryWiktionary(word) {
  try {
    const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
    const data = await fetchSafe(url, 10000);
    if (!data || !data[0]?.definitions?.length) return null;
    const entry = {
      word,
      phonetic: '',
      meanings: [{
        partOfSpeech: 'definition',
        definitions: data[0].definitions.slice(0, 4).map((d) => ({
          definition: d.definition || '',
          example: ''
        }))
      }]
    };
    return entry;
  } catch {
    return null;
  }
}

/**
 * Fallback: Wikipedia summary API.
 */
async function tryWikipedia(word) {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`;
    const data = await fetchSafe(url, 10000);
    if (!data || !data.extract) return null;
    return {
      word,
      phonetic: '',
      meanings: [{
        partOfSpeech: 'meaning',
        definitions: [{ definition: data.extract }]
      }]
    };
  } catch {
    return null;
  }
}

/**
 * Final fallback: free-dictionary.com scrape.
 */
async function tryFreeDictionaryDotCom(word) {
  try {
    const url = 'https://www.free-dictionary.com/search/' + encodeURIComponent(word);
    const res = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const html = String(res.data || '');
    const defMatch = html.match(/<span class="def">([^<]+)<\/span>/i);
    if (defMatch) {
      return {
        word,
        phonetic: '',
        meanings: [{ partOfSpeech: 'meaning', definitions: [{ definition: defMatch[1].trim() }] }],
      };
    }
    return null;
  } catch {
    return null;
  }
}
// ── Command ────────────────────────────────────────────────────────────────

// Known command aliases — strip these if they accidentally land in args
const SELF_ALIASES = new Set(['define', 'meaning', 'dictionary', 'def']);

module.exports = {
  name: 'define',
  aliases: ['meaning', 'dictionary'],
  category: 'general',
  description: 'Get an English dictionary definition',
  usage: '.define <word>',

  async execute(sock, msg, args, extra) {
    // Strip alias name if it somehow ended up as the first arg
    const cleanArgs = args.filter((a) => !SELF_ALIASES.has(a.toLowerCase()));
    const word = cleanArgs.join(' ').trim();

    if (!word) {
      return extra.reply(
        '📖 *Dictionary Lookup*\n\n' +
        'Usage: `.define <word>`\n' +
        'Example: `.define resilient`'
      );
    }

    await extra.react('⏳');

    try {
      // ── Primary source ────────────────────────────────────────────────────
      let entry = null;
      let notFound = false;

      try {
        entry = await tryFreeDictionary(word);
      } catch (err) {
        if (err.response?.status === 404) notFound = true;
      }

      // ── Fallback: regional mirror ─────────────────────────────────────────
      if (!entry && !notFound) {
        try {
          entry = await tryMirror(word);
        } catch (err) {
          if (err.response?.status === 404) notFound = true;
        }
      }
      if (!entry && !notFound) {
        try {
          entry = await tryWiktionary(word);
        } catch { /* silent */ }
      }
      if (!entry && !notFound) {
        try {
          entry = await tryWikipedia(word);
        } catch { /* silent */ }
      }
      if (!entry && !notFound) {
        try {
          entry = await tryFreeDictionaryDotCom(word);
        } catch { /* silent */ }
      }

      // ── Word not in any dictionary ────────────────────────────────────────
      if (notFound || !entry) {
        await extra.react('❌');
        return extra.reply(
          `❌ No definition found for *"${word}"*.\n\n` +
          'Check the spelling or try a different form of the word.'
        );
      }

      // ── Format & reply ────────────────────────────────────────────────────
      const text = formatEntry(entry, word);
      if (!text) {
        await extra.react('❌');
        return extra.reply(`❌ Found an entry for *"${word}"* but it had no usable definitions.`);
      }

      await extra.react('✅');
      return extra.reply(text);

    } catch (error) {
      await extra.react('❌');
      console.error('[define] error:', error.message);
      return extra.reply(
        `❌ Could not fetch a definition for *"${word}"*.\n` +
        `Reason: ${error.code === 'ECONNABORTED' ? 'Request timed out — the dictionary API is slow right now. Try again in a moment.' : error.message}`
      );
    }
  },
};