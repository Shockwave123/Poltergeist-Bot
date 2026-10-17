/**
 * Flashcards + Quiz Command - AI-generated study sets.
 *
 * Usage:
 *   .flashcards <topic> [count]  - Generate a flashcard deck (default 6, max 12)
 *   .quiz <topic>                - Start an interactive 5-question AI quiz
 *
 * Quiz flow: one multiple-choice question at a time, user replies 1-4 (no
 * prefix). Session state lives in a bounded in-memory Map with TTL - no
 * database, optimized for the Render free instance.
 */

const { generateContent } = require('../../utils/googleAi');
const { getKey } = require('../../utils/userApiKeys');

const aiQuizGames = new Map(); // `${from}|${sender}` -> session
const QUIZ_QUESTIONS = 5;
const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_SESSIONS = 100;

function sessionKey(from, sender) {
  return `${from}|${sender}`;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [key, session] of aiQuizGames) {
    if (now - session.at > SESSION_TTL_MS) aiQuizGames.delete(key);
  }
  if (aiQuizGames.size > MAX_SESSIONS) {
    const sorted = [...aiQuizGames.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0, excess = sorted.length - MAX_SESSIONS; i < excess; i += 1) {
      aiQuizGames.delete(sorted[i][0]);
    }
  }
}

/** Extract a JSON array from an AI reply that may include fences or prose. */
function parseJsonArray(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeCards(raw, count) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((card) => {
      const question = String(card?.question || card?.q || '').trim();
      const options = Array.isArray(card?.options)
        ? card.options.map((option) => String(option).trim()).filter(Boolean)
        : [];
      let answerIndex = Number.parseInt(card?.answerIndex ?? card?.correct ?? card?.a, 10);
      if (!Number.isInteger(answerIndex)) {
        // Model may answer with the option text instead of its index
        answerIndex = options.findIndex(
          (option) => option.toLowerCase() === String(card?.answer || '').trim().toLowerCase(),
        );
      }
      return { question, options, answerIndex };
    })
    .filter((card) =>
      card.question &&
      card.options.length >= 2 &&
      card.options.length <= 4 &&
      card.answerIndex >= 0 &&
      card.answerIndex < card.options.length)
    .slice(0, count);
}

function formatQuestion(session) {
  const card = session.questions[session.index];
  const options = card.options.map((option, i) => `${i + 1}. ${option}`).join('\n');
  return `❓ *Quiz ${session.index + 1}/${session.questions.length}* (${session.topic})\n\n*${card.question}*\n\n${options}\n\nReply with 1-${card.options.length} (no prefix).`;
}

async function generateQuizQuestions(topic, senderId) {
  const prompt = [
    `Create exactly ${QUIZ_QUESTIONS} multiple-choice trivia questions about: "${topic}".`,
    'Mix difficulty: 2 easy, 2 medium, 1 hard.',
    'Respond with ONLY a valid JSON array, no prose, in this exact shape:',
    '[{"question":"...","options":["...","...","...","..."],"answerIndex":0}]',
    'answerIndex must be the 0-based position of the correct option. Exactly 4 options each.',
  ].join('\n');

  const reply = await generateContent([{ text: prompt }], {
    temperature: 0.6,
    maxOutputTokens: 1800,
    timeout: 85000,
    apiKey: getKey(senderId),
    senderId,
  });

  return normalizeCards(parseJsonArray(reply), QUIZ_QUESTIONS);
}

module.exports = {
  name: 'flashcards',
  aliases: ['quiz', 'aiquiz', 'cards', 'deck'],
  category: 'ai',
  description: 'Generate AI flashcards or run an interactive AI quiz on any topic',
  usage: '.flashcards <topic> [count]  |  .quiz <topic>',

  /**
   * Grade a plain-text reply for an active AI quiz session.
   * Called from handler.js before prefix parsing; returns true if consumed.
   */
  async handleQuizInput(sock, msg, extra) {
    cleanupSessions();
    const session = aiQuizGames.get(sessionKey(extra.from, extra.sender));
    if (!session) return false;

    const text = (msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      '').trim();
    if (!text || text.startsWith('.')) return false; // commands still work mid-quiz

    const card = session.questions[session.index];
    const answer = Number.parseInt(text, 10);
    if (Number.isNaN(answer) || answer < 1 || answer > card.options.length) {
      return false; // not an answer; let other handlers try
    }

    const correct = answer - 1 === card.answerIndex;
    if (correct) session.score += 1;
    session.index += 1;
    session.at = Date.now();

    const verdict = correct
      ? '✅ *Correct!*'
      : `❌ *Wrong* - the answer was: ${card.options[card.answerIndex]}`;

    if (session.index >= session.questions.length) {
      aiQuizGames.delete(sessionKey(extra.from, extra.sender));
      const pct = Math.round((session.score / session.questions.length) * 100);
      const grade = pct === 100 ? '🏆 Perfect!' : pct >= 60 ? '💪 Well done!' : '📖 Keep studying!';
      await sock.sendMessage(extra.from, {
        text: `${verdict}\n\n📊 *Quiz finished: ${session.score}/${session.questions.length} (${pct}%)*\n${grade}`,
      }, { quoted: msg });
      return true;
    }

    await sock.sendMessage(extra.from, {
      text: `${verdict}\n\n${formatQuestion(session)}`,
    }, { quoted: msg });
    return true;
  },

  async execute(sock, msg, args, extra) {
    try {
      const raw = args.join(' ').trim();
      if (!raw) {
        return extra.reply(
          '📚 *AI Flashcards & Quiz*\n\n' +
          `• ${extra.prefix || '.'}flashcards <topic> [count] - generate a deck (default 6, max 12)\n` +
          `• ${extra.prefix || '.'}quiz <topic> - interactive 5-question quiz (reply 1-4)\n\n` +
          'Examples:\n' +
          '· .flashcards photosynthesis 8\n' +
          '· .quiz world capitals'
        );
      }

      // Detect which alias was invoked (quiz vs flashcards deck)
      const body = (msg.message?.extendedTextMessage?.text ||
        msg.message?.conversation || '').trim();
      const firstToken = (body.split(/\s+/)[0] || '').toLowerCase().replace(/^[^\w]+/, '');
      const isQuizMode = firstToken === 'quiz' || firstToken === 'aiquiz';

      if (isQuizMode) {
        cleanupSessions();
        const key = sessionKey(extra.from, extra.sender);
        if (aiQuizGames.has(key)) {
          return extra.reply('⏳ You already have an active quiz. Finish it first (reply 1-4), or wait 5 minutes for it to expire.');
        }

        await extra.react('🧠');
        const questions = await generateQuizQuestions(raw, extra.sender);
        if (questions.length < 3) {
          throw new Error('The AI returned too few valid questions. Try a simpler topic.');
        }

        aiQuizGames.set(key, {
          topic: raw.slice(0, 60),
          questions,
          index: 0,
          score: 0,
          at: Date.now(),
        });

        await extra.reply(`🧠 *AI Quiz: ${raw.slice(0, 60)}*\n${questions.length} questions - reply with the option number!\n\n${formatQuestion(aiQuizGames.get(key))}`);
        await extra.react('✅');
        return;
      }

      // Flashcard deck mode
      const countMatch = raw.match(/^(.*?)\s+(\d{1,2})$/);
      const topic = (countMatch ? countMatch[1] : raw).trim() || raw;
      const count = Math.min(12, Math.max(3, countMatch ? Number.parseInt(countMatch[2], 10) : 6));

      await extra.react('📚');
      const prompt = [
        `Create exactly ${count} study flashcards about: "${topic}".`,
        'Make them genuinely useful for studying: facts, concepts, cause-and-effect.',
        'Respond with ONLY a valid JSON array, no prose:',
        '[{"front":"question or term","back":"concise answer"}]',
      ].join('\n');

      const reply = await generateContent([{ text: prompt }], {
        temperature: 0.5,
        maxOutputTokens: 1600,
        timeout: 85000,
        apiKey: getKey(extra.sender),
        senderId: extra.sender,
      });

      const parsed = parseJsonArray(reply);
      const cards = (Array.isArray(parsed) ? parsed : [])
        .map((card) => ({
          front: String(card?.front || card?.question || card?.q || '').trim(),
          back: String(card?.back || card?.answer || card?.a || '').trim(),
        }))
        .filter((card) => card.front && card.back)
        .slice(0, count);

      if (!cards.length) throw new Error('The AI returned an invalid deck. Please try again.');

      const lines = cards.map((card, i) => `*${i + 1}.* ${card.front}\n   → ${card.back}`);
      await extra.reply(`📚 *Flashcards: ${topic}* (${cards.length})\n\n${lines.join('\n\n')}\n\n__Start a quiz with: ${extra.prefix || '.'}quiz ${topic}__`);
      await extra.react('✅');
    } catch (error) {
      console.error('[flashcards] error:', error);
      try { await extra.react('❌'); } catch { /* ignore */ }
      if (error.message?.includes('not configured')) {
        return extra.reply(error.message);
      }
      await extra.reply(`❌ Could not generate that study set.\n\n${error.message}`);
    }
  },
};
