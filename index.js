/**
 * WhatsApp MD Bot - Main Entry Point
 */
process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/tmp/puppeteer_cache_disabled';

const { initializeTempSystem } = require('./utils/tempManager');
const { startCleanup } = require('./utils/cleanup');
initializeTempSystem();
startCleanup();
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const forbiddenPatternsConsole = [
  'closing session',
  'closing open session',
  'sessionentry',
  'prekey bundle',
  'pendingprekey',
  '_chains',
  'registrationid',
  'currentratchet',
  'chainkey',
  'ratchet',
  'signal protocol',
  'ephemeralkeypair',
  'indexinfo',
  'basekey'
];

/**
 * JSON.stringify throws on circular structures (sockets, messages, ...).
 * Logging must never be able to crash the process, so everything goes through here.
 */
const safeStringify = (value) => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Error) return value.stack || value.message || 'Error';
  try {
    return JSON.stringify(value);
  } catch (error) {
    try {
      return String(value);
    } catch (innerError) {
      return '[unserializable]';
    }
  }
};

const shouldLog = (args) => {
  const message = args.map(safeStringify).join(' ').toLowerCase();
  return !forbiddenPatternsConsole.some(pattern => message.includes(pattern));
};

console.log = (...args) => {
  if (shouldLog(args)) originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
  if (shouldLog(args)) originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  if (shouldLog(args)) originalConsoleWarn.apply(console, args);
};

// Now safe to load libraries
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const qrImage = require('qrcode');
const http = require('http');
const config = require('./config');
const handler = require('./handler');
const database = require('./database');
const sessionManager = require('./utils/sessionManager');
const { stopCleanup, cleanupOldFiles } = require('./utils/cleanup');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Connection / pairing state
// ---------------------------------------------------------------------------
const BOT_STARTED_AT = Date.now();
let activeSocket = null;
let activeAuthState = null;
let socketGeneration = 0; // increments for every socket we create; stale sockets are ignored
let latestQrDataUrl = null;
let latestQrIssuedAt = 0;
let latestQrRaw = '';
let qrCount = 0;
let lastQrRestartAt = 0;
let latestPairingCode = null;
let pairingCodeIssuedAt = 0;
let pendingPairingPhone = '';
let authMethod = 'none'; // 'qr' | 'pairing' | 'session-id' | 'session-file' | 'none'
let setupStatus = 'Starting bot...';
let pairingRequestAt = 0;
let pairingInFlight = false;
let pairingReadyAt = 0;
let socketOpenedAt = 0;
let lastWelcomeSessionId = '';
let pairingCompletedAt = 0;

// ---------------------------------------------------------------------------
// Self-healing / observability state
// ---------------------------------------------------------------------------
let reconnectAttempts = 0;
let reconnectTimer = null;
let startingSocket = false;
let healthMonitorTimer = null;
let lastServerTrafficAt = Date.now();
let lastProbeAt = 0;
let failedProbes = 0;
let reconnectCount = 0;
let lastDisconnectReason = '';
let lastSocketError = '';
let crashTimestamps = [];
let totalMessagesSeen = 0;

const connectionStats = () => ({
  startedAt: BOT_STARTED_AT,
  uptimeSeconds: Math.round((Date.now() - BOT_STARTED_AT) / 1000),
  socketOpenedAt,
  connected: Boolean(activeSocket && isSocketOpen(activeSocket)),
  linked: Boolean(activeAuthState?.creds?.registered),
  reconnects: reconnectCount,
  reconnectAttempts,
  lastDisconnectReason,
  lastSocketError,
  qrCount,
  qrAgeSeconds: latestQrIssuedAt ? Math.round((Date.now() - latestQrIssuedAt) / 1000) : null,
  authMethod,
  pendingPairingPhone,
  totalMessagesSeen,
  memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  heapUsedMb: Math.round(process.memoryUsage().heapUsed / (1024 * 1024))
});

/** True when the socket's websocket is open (works across Baileys versions). */
function isSocketOpen(sock) {
  if (!sock || !sock.ws) return false;
  if (typeof sock.ws.isOpen === 'boolean') return sock.ws.isOpen;
  return sock.ws.readyState === 1;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


const normalizePhoneNumber = (value) => {
  let phoneNumber = String(value || '').trim().replace(/[^0-9]/g, '');
  if (phoneNumber.startsWith('00')) phoneNumber = phoneNumber.slice(2);
  if (!/^\d{8,15}$/.test(phoneNumber)) {
    throw new Error('Enter 8 to 15 digits with the country code, for example 2348012345678.');
  }
  return phoneNumber;
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const setupPage = () => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.botName)} setup</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 20px; color: #17202a; }
    main { border: 1px solid #d8dee4; border-radius: 10px; padding: 24px; }
    img { display: block; width: min(100%, 360px); margin: 20px auto; border: 1px solid #d8dee4; border-radius: 8px; }
    input, button { box-sizing: border-box; font: inherit; padding: 10px; }
    input { width: 100%; margin: 8px 0; }
    button { cursor: pointer; background: #1769aa; color: white; border: 0; border-radius: 6px; }
    #result { margin-top: 16px; font-weight: 600; word-break: break-word; }
    .muted { color: #5f6b76; }
    .note { background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 10px; font-size: 0.92em; }
    .ok { background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 8px; padding: 14px; }
    .code { font-size: 2em; letter-spacing: 0.22em; font-weight: 700; color: #1b5e20; font-family: monospace; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .small { font-size: 0.86em; }
    .banner { padding: 14px 16px; border-radius: 8px; font-size: 1.05em; margin: 12px 0 18px; border: 1px solid transparent; }
    .banner strong { font-weight: 800; letter-spacing: 0.04em; }
    .banner.okc { background: #e8f5e9; border-color: #a5d6a7; color: #1b5e20; }
    .banner.waitc { background: #fff8e1; border-color: #ffe082; color: #7a5b00; }
    .banner.downc { background: #ffebee; border-color: #ef9a9a; color: #b71c1c; }
    .timer { font-weight: 800; font-size: 1.12em; font-family: monospace; padding: 8px 12px; border-radius: 6px; display: inline-block; margin: 6px 0; }
    .timer.qrt { background: #e3f2fd; color: #0d47a1; border: 1px solid #90caf9; }
    .timer.pt { background: #f3e5f5; color: #4a148c; border: 1px solid #ce93d8; }
    .timer.done { background: #eceff1; color: #546e7a; border-color: #cfd8dc; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(config.botName)} connection</h1>
    <div id="conn-banner" class="banner waitc"><strong>⏳ CONNECTING...</strong> &mdash; fetching live status from the bot.</div>
    <p class="muted">Choose one method to connect this deployment to WhatsApp. This page refreshes itself every few seconds.</p>

    <h2>Option 1: QR code</h2>
    <p>Open WhatsApp on your phone, go to Linked devices, choose Link a device, then scan the code below.</p>
    <img id="qr" alt="WhatsApp QR code" src="${latestQrDataUrl || ''}" style="${latestQrDataUrl ? 'display:block' : 'display:none'}">
    <p class="muted small" id="qr-info">Loading connection state...</p>
    <div><span class="timer qrt" id="qr-timer">QR refresh in --</span></div>

    <h2>Option 2: Pairing code</h2>
    <p>Enter the WhatsApp number with country code, without <code>+</code>, spaces, or punctuation.</p>
    <div><span class="timer pt" id="pair-timer">No pairing code active</span></div>
    <p class="note">
      After you click <strong>Generate pairing code</strong>, WhatsApp sends a <strong>device-link notification</strong>
      to that phone number. Open WhatsApp on that phone, open Linked devices, choose
      <strong>Link with phone number</strong> and enter the code shown below.
    </p>
    <form id="pair-form">
      <input name="phoneNumber" inputmode="numeric" placeholder="e.g. 2348012345678" required pattern="[0-9]{8,15}">
      <button type="submit">Generate pairing code</button>
    </form>
    <div id="result"></div>

    <h2>Session id</h2>
    <div id="session-box" class="ok" style="display:none">
      <div class="small"><strong>Session generated.</strong> Copy it from the welcome message the bot sent to your WhatsApp
        (or use the <code>sessionid</code> command) and keep it safe &mdash; it can log in as this WhatsApp account.</div>
      <div style="margin-top:8px;font-family:monospace;word-break:break-all;" id="session-text"></div>
    </div>
    <p class="muted small" id="session-info">No session stored yet. Pair with a QR code or a pairing code to create one.</p>

    <div class="row" style="margin-top:18px">
      <button type="button" id="restart-btn" style="background:#5f6b76">Get a fresh QR code</button>
    </div>
    <p class="muted" id="status">Status: ${escapeHtml(setupStatus)}</p>
  </main>
  <script>
    (function () {
      var qrImg = document.getElementById('qr');
      var qrInfo = document.getElementById('qr-info');
      var statusEl = document.getElementById('status');
      var sessionBox = document.getElementById('session-box');
      var sessionText = document.getElementById('session-text');
      var sessionInfo = document.getElementById('session-info');
      var result = document.getElementById('result');
      var pairTimer = null;

      function esc(text) {
        return String(text === undefined || text === null ? '' : text)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      function showPairingCode(code, seconds, phone) {
        var remaining = seconds > 0 ? seconds : 120;
        result.innerHTML =
          '<div class="ok">' +
          '<div class="small">Device-link notification sent to <strong>' + esc(phone) + '</strong>. ' +
          'Open WhatsApp &rarr; Linked devices &rarr; Link with phone number, then enter:</div>' +
          '<div class="code" id="pairing-code">' + esc(code) + '</div>' +
          '<div class="small muted" id="pairing-timer">Expires in ' + remaining + 's</div>' +
          '</div>';
        if (pairTimer) { clearInterval(pairTimer); }
        pairTimer = setInterval(function () {
          var timerEl = document.getElementById('pairing-timer');
          if (!timerEl) { clearInterval(pairTimer); return; }
          remaining -= 1;
          if (remaining <= 0) {
            timerEl.textContent = 'This code expired. Click Generate pairing code again.';
            clearInterval(pairTimer);
          } else {
            timerEl.textContent = 'Expires in ' + remaining + 's';
          }
        }, 1000);
      }

      function render(data) {
        if (!data) { return; }
        statusEl.textContent = 'Status: ' + esc(data.status);

        // 1) Bold live connection banner — always mirrors the bot's current state
        var banner = document.getElementById('conn-banner');
        if (banner) {
          if (data.linked) {
            banner.className = 'banner okc';
            banner.innerHTML = '<strong>\u2705 CONNECTED</strong> &mdash; bot is linked' +
              (data.botNumber ? ' as <strong>+' + esc(data.botNumber) + '</strong>' : '') +
              ' and online.';
          } else if (data.pairingActive) {
            banner.className = 'banner waitc';
            banner.innerHTML = '<strong>\u23F3 WAITING FOR PAIRING CODE</strong> &mdash; enter the code on your phone to finish linking.';
          } else if (data.qr) {
            banner.className = 'banner waitc';
            banner.innerHTML = '<strong>\u23F3 WAITING FOR QR SCAN</strong> &mdash; scan the code below with your phone.';
          } else if (data.connected) {
            banner.className = 'banner waitc';
            banner.innerHTML = '<strong>\u23F3 CONNECTING...</strong> &mdash; socket is open, waiting for WhatsApp to issue a code.';
          } else {
            banner.className = 'banner downc';
            banner.innerHTML = '<strong>\u26D4 NOT CONNECTED</strong> &mdash; ' + esc(data.status || 'waiting for the bot...');
          }
        }

        if (data.qr) {
          if (qrImg.getAttribute('src') !== data.qr) { qrImg.setAttribute('src', data.qr); }
          qrImg.style.display = 'block';
        }
        if (data.linked) {
          qrInfo.textContent = 'Connected as ' + (data.botNumber || 'unknown') + '. The QR code is no longer needed.';
        } else if (data.qr) {
          qrInfo.textContent = 'Newest QR code generated ' + (data.qrAgeSeconds === null ? 'just now' : data.qrAgeSeconds + 's ago') +
            '. Codes rotate automatically, so always scan the code currently shown.';
        } else {
          qrInfo.textContent = 'Waiting for a fresh QR code from WhatsApp...';
        }

        // 2a) Bold countdown timer for the QR code option
        var qrTimer = document.getElementById('qr-timer');
        if (qrTimer) {
          if (data.linked) {
            qrTimer.className = 'timer qrt done';
            qrTimer.textContent = 'QR retired \u2014 bot is connected';
          } else if (typeof data.qrRefreshSeconds === 'number') {
            qrTimer.className = 'timer qrt';
            qrTimer.textContent = 'QR refreshes in ' + data.qrRefreshSeconds + 's';
          } else {
            qrTimer.className = 'timer qrt done';
            qrTimer.textContent = 'Preparing a fresh QR...';
          }
        }

        // 2b) Bold countdown timer for the phone-number pairing option
        var pairTimerEl = document.getElementById('pair-timer');
        if (pairTimerEl) {
          if (data.linked) {
            pairTimerEl.className = 'timer pt done';
            pairTimerEl.textContent = 'Pairing finished \u2014 bot is connected';
          } else if (data.pairing && data.pairing.code) {
            pairTimerEl.className = 'timer pt';
            pairTimerEl.textContent = 'Code expires in ' + (data.pairing.expiresInSeconds || 0) + 's';
          } else {
            pairTimerEl.className = 'timer pt done';
            pairTimerEl.textContent = 'No pairing code active';
          }
        }

        // Smooth 1s local tick: remember server values so the countdowns
        // move every second instead of every poll (3s).
        qrCountdown = (typeof data.qrRefreshSeconds === 'number' && !data.linked)
          ? data.qrRefreshSeconds : null;
        pairCountdown = (data.linked || !data.pairing || !data.pairing.code)
          ? null : (data.pairing.expiresInSeconds || 0);

        if (data.sessionReady) {
          sessionBox.style.display = 'block';
          sessionText.textContent = data.sessionPreview || '';
          sessionInfo.textContent = 'Session stored on the server. Add it as the SESSION_ID environment variable to survive restarts.';
        } else {
          sessionBox.style.display = 'none';
        }

        if (data.pairing && data.pairing.code) {
          showPairingCode(data.pairing.code, data.pairing.expiresInSeconds, data.pairing.phoneNumber);
        }
      }

      async function refresh() {
        try {
          var response = await fetch('/api/status', { cache: 'no-store' });
          render(await response.json());
        } catch (error) {
          qrInfo.textContent = 'Lost contact with the bot process. It may be restarting - retrying...';
        }
      }

      document.getElementById('pair-form').addEventListener('submit', async function (event) {
        event.preventDefault();
        result.innerHTML = '<span class="muted">Requesting a pairing code, please wait...</span>';
        var phoneNumber = new FormData(event.target).get('phoneNumber');
        try {
          var response = await fetch('/api/pair', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ phoneNumber: phoneNumber })
          });
          var data = await response.json();
          if (data.error) {
            result.innerHTML = '<span style="color:#c0392b">' + esc(data.error) + '</span>';
            return;
          }
          showPairingCode(data.code, data.expiresInSeconds || 120, data.phoneNumber || phoneNumber);
          refresh();
        } catch (error) {
          result.innerHTML = '<span style="color:#c0392b">Network error. Please try again.</span>';
        }
      });

      document.getElementById('restart-btn').addEventListener('click', async function () {
        qrInfo.textContent = 'Restarting the WhatsApp connection to fetch a fresh QR code...';
        try {
          await fetch('/api/refresh', { method: 'POST' });
        } catch (error) { /* the poll below will show the result */ }
        setTimeout(refresh, 2500);
      });

      refresh();
      setInterval(refresh, 3000);

      // Local 1s tick so both countdowns move smoothly between polls
      var qrCountdown = null;
      var pairCountdown = null;
      setInterval(function () {
        var qrEl = document.getElementById('qr-timer');
        if (qrEl && qrCountdown !== null) {
          qrCountdown = Math.max(0, qrCountdown - 1);
          qrEl.textContent = qrCountdown > 0
            ? 'QR refreshes in ' + qrCountdown + 's'
            : 'Refreshing QR now...';
        }
        var ptEl = document.getElementById('pair-timer');
        if (ptEl && pairCountdown !== null) {
          pairCountdown = Math.max(0, pairCountdown - 1);
          ptEl.textContent = pairCountdown > 0
            ? 'Code expires in ' + pairCountdown + 's'
            : 'Code expired \u2014 request a new one';
          if (pairCountdown === 0) pairCountdown = null;
        }
      }, 1000);
    })();
  </script>
</body>
</html>`;

const startSetupServer = () => {
  const server = http.createServer(async (request, response) => {
    const url = (request.url || '/').split('?')[0];

    // Uptime monitors (UptimeRobot etc.) can hit either endpoint
    if (request.method === 'GET' && (url === '/health' || url === '/ping')) {
      const stats = connectionStats();
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({
        ok: true,
        status: setupStatus,
        connected: stats.connected,
        linked: stats.linked,
        authMethod: stats.authMethod,
        reconnects: stats.reconnects,
        uptimeSeconds: stats.uptimeSeconds,
        memoryMb: stats.memoryMb,
        qrAvailable: Boolean(latestQrDataUrl),
        sessionStored: sessionManager.getStatus().hasSession
      }));
      return;
    }

    if (request.method === 'GET' && url === '/api/status') {
      const session = sessionManager.getStatus();
      const pairingActive = Boolean(latestPairingCode) && (Date.now() - pairingCodeIssuedAt) < PAIRING_CODE_TTL_MS;
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({
        status: setupStatus,
        qr: latestQrDataUrl,
        qrAgeSeconds: latestQrIssuedAt ? Math.round((Date.now() - latestQrIssuedAt) / 1000) : null,
        // Countdown data for the QR refresh timer
        qrRefreshTimeoutSeconds: Math.round(config.health.qrRefreshTimeoutMs / 1000),
        // Countdown is valid whenever a QR was issued and we are not registered,
        // regardless of the socket's transient open/closing state during refresh.
        qrRefreshSeconds: (latestQrIssuedAt && !activeAuthState?.creds?.registered)
          ? Math.max(0, Math.round(config.health.qrRefreshTimeoutMs / 1000) - Math.round((Date.now() - latestQrIssuedAt) / 1000))
          : null,
        connected: isSocketOpen(activeSocket),
        linked: Boolean(activeAuthState?.creds?.registered),
        botNumber: activeSocket?.user?.id ? activeSocket.user.id.split(':')[0].split('@')[0] : null,
        authMethod,
        sessionReady: session.hasSession,
        sessionPreview: session.sessionPreview,
        // Countdown data for the phone-number pairing timer
        pairingActive,
        pairing: pairingActive ? {
          phoneNumber: pendingPairingPhone,
          code: latestPairingCode,
          issuedAt: pairingCodeIssuedAt,
          expiresInSeconds: Math.max(0, Math.round((PAIRING_CODE_TTL_MS - (Date.now() - pairingCodeIssuedAt)) / 1000))
        } : null
      }));
      return;
    }

    if (request.method === 'GET' && url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(setupPage());
      return;
    }

    // Ask for a brand new QR code without redeploying
    if (request.method === 'POST' && url === '/api/refresh') {
      const respond = (status, payload) => {
        response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify(payload));
      };
      if (isSocketOpen(activeSocket) && activeAuthState?.creds?.registered) {
        respond(409, { error: 'The bot is already connected, so there is no QR code to refresh.' });
        return;
      }
      if (Date.now() - lastRefreshRequestAt < 20000) {
        respond(429, { error: 'A refresh was requested moments ago. Please wait a few seconds.' });
        return;
      }
      lastRefreshRequestAt = Date.now();
      respond(200, { ok: true, message: 'Restarting the WhatsApp connection for a fresh QR code.' });
      setTimeout(() => {
        restartSocket('setup-refresh').catch((error) => console.error('[refresh] failed:', error?.message || error));
      }, 50);
      return;
    }

    if (request.method === 'POST' && url === '/api/pair') {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2000) request.destroy();
      });
      request.on('end', async () => {
        let result = null;
        let failure = null;
        try {
          const phoneNumber = JSON.parse(body || '{}').phoneNumber;
          result = await requestPairingCodeFor(phoneNumber);
        } catch (error) {
          failure = error;
        }
        if (failure) {
          response.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          response.end(JSON.stringify({ error: failure.message || 'Unable to generate a pairing code.' }));
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        response.end(JSON.stringify(result));
      });
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });

  server.on('error', (error) => {
    console.error('Setup server error:', error?.message || error);
  });

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Setup page available on port ${port}. Open the deployed service URL to connect WhatsApp.`);
  });
  return server;
};

// Remove Puppeteer cache (if some dependency downloaded Chromium into ~/.cache/puppeteer)
function cleanupPuppeteerCache() {
  try {
    const home = os.homedir();
    const cacheDir = path.join(home, '.cache', 'puppeteer');

    if (fs.existsSync(cacheDir)) {
      console.log('🧹 Removing Puppeteer cache at:', cacheDir);
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('✅ Puppeteer cache removed');
    }
  } catch (err) {
    console.error('⚠️ Failed to cleanup Puppeteer cache:', err.message || err);
  }
}
// Optimized in-memory store with hard limits (Map-based for better memory management)
const store = {
  messages: new Map(), // Use Map instead of plain object
  maxPerChat: 20, // Limit to 20 messages per chat

  bind: (ev) => {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.id) continue;

        const jid = msg.key.remoteJid;
        if (!store.messages.has(jid)) {
          store.messages.set(jid, new Map());
        }

        const chatMsgs = store.messages.get(jid);
        chatMsgs.set(msg.key.id, msg);

        // Aggressive cleanup per chat - keep only recent messages
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest message (first entry in Map)
          const oldestKey = chatMsgs.keys().next().value;
          chatMsgs.delete(oldestKey);
        }
      }
    });
  },

  loadMessage: async (jid, id) => {
    return store.messages.get(jid)?.get(id) || null;
  }
};

// Optimized message deduplication (Set-based, no timestamps needed)
const processedMessages = new Set();

// Aggressive cleanup - clear every 5 minutes
setInterval(() => {
  processedMessages.clear();
}, 5 * 60 * 1000); // Every 5 minutes

// Custom Pino logger with suppression for Baileys noise
const createSuppressedLogger = (level = 'silent') => {
  const forbiddenPatterns = [
    'closing session',
    'closing open session',
    'sessionentry',
    'prekey bundle',
    'pendingprekey',
    '_chains',
    'registrationid',
    'currentratchet',
    'chainkey',
    'ratchet',
    'signal protocol',
    'ephemeralkeypair',
    'indexinfo',
    'basekey',
    'sessionentry',
    'ratchetkey'
  ];

  let logger;
  try {
    logger = pino({
      level,
      // Fallback transport without pino-pretty (in case not installed)
      transport: process.env.NODE_ENV === 'production' ? undefined : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname'
        }
      },
      customLevels: {
        trace: 0,
        debug: 1,
        info: 2,
        warn: 3,
        error: 4,
        fatal: 5
      },
      // Redact sensitive fields
      redact: ['registrationId', 'ephemeralKeyPair', 'rootKey', 'chainKey', 'baseKey']
    });
  } catch (err) {
    // Fallback to basic pino without transport
    logger = pino({ level });
  }

  // Wrap log methods to filter
  const originalInfo = logger.info.bind(logger);
  logger.info = (...args) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ').toLowerCase();
    if (!forbiddenPatterns.some(pattern => msg.includes(pattern))) {
      originalInfo(...args);
    }
  };
  logger.debug = () => { }; // Fully disable debug
  logger.trace = () => { }; // Fully disable trace
  return logger;
};

// ---------------------------------------------------------------------------
// Socket lifecycle helpers
// ---------------------------------------------------------------------------
const PAIRING_CODE_TTL_MS = 120 * 1000;
let socketCreatedAt = 0;
let lastRefreshRequestAt = 0;

/** Banner printed when the deployment has no session yet. */
const printHostedSetupMessage = () => {
  console.log('🌐 Hosted setup detected.');
  console.log('➡️ A stored session (SESSION_ID or database/session.json) is loaded automatically.');
  console.log('➡️ Otherwise open the setup page to scan the QR code or request a pairing code.');
  console.log('➡️ After linking, the session id is saved on disk and sent to your WhatsApp.');
  console.log('➡️ Recommended env vars: SESSION_ID, OWNER_NUMBER, GEMINI_API_KEY or OPENROUTER_API_KEY');
  console.log('');
};

/**
 * Make sure session/creds.json is ready before a socket is created.
 * Priority: SESSION_ID (env/config) -> session remembered in database/session.json -> file on disk.
 */
function prepareAuthFiles() {
  const folder = sessionManager.getSessionFolder();
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  // A truncated/placeholder creds.json (e.g. left by a crashed write) makes
  // Baileys crash at boot with "reading 'public'". Quarantine it and fall
  // through to SESSION_ID / stored-session restore or a fresh QR pair.
  if (sessionManager.hasBrokenCreds()) {
    sessionManager.quarantineBrokenCreds();
  }

  const configured = String(config.sessionID || '').trim();
  const hasCreds = sessionManager.hasLocalCreds();

  if (configured && sessionManager.isSessionIdValid(configured) && !hasCreds) {
    // Validate the decoded payload BEFORE writing it — a placeholder string
    // (53-byte {me,registered}) would otherwise poison session/creds.json.
    let decodedOk = false;
    try {
      const raw = sessionManager.decodeSessionId(configured);
      decodedOk = sessionManager.isUsableCreds(raw);
    } catch (error) { decodedOk = false; }
    if (!decodedOk) {
      console.error('📡 Session: SESSION_ID decodes to an unlinked placeholder, ignoring it. Pair fresh to get a real session id.');
    } else if (sessionManager.importSessionToDisk(configured, { authMethod: 'session-id' })) {
      authMethod = 'session-id';
      console.log('📡 Session: loaded from SESSION_ID.');
      return;
    } else {
      console.error('📡 Session: SESSION_ID could not be imported. Falling back to QR pairing.');
    }
  }

  if (!hasCreds) {
    const stored = sessionManager.getSessionId();
    if (stored && sessionManager.isSessionIdValid(stored)) {
      let storedOk = false;
      try {
        storedOk = sessionManager.isUsableCreds(sessionManager.decodeSessionId(stored));
      } catch (error) { storedOk = false; }
      if (!storedOk) {
        console.error('📡 Session: database/session.json holds an unlinked placeholder, ignoring it. Pair fresh to get a real session id.');
        sessionManager.setState({ sessionId: '' });
      } else if (sessionManager.importSessionToDisk(stored, { authMethod: 'session-file' })) {
        authMethod = 'session-file';
        console.log('📡 Session: restored from database/session.json.');
        return;
      }
    }
    if (authMethod !== 'pairing') authMethod = 'qr';
    return;
  }

  if (authMethod === 'none' || authMethod === 'qr') authMethod = 'session-file';
}

/** Export creds into a session id, remember it, and print it for the deployment logs. */
function persistSession(context = 'update') {
  try {
    if (!sessionManager.hasLocalCreds()) return null;
    const sessionId = sessionManager.exportSessionFromDisk();
    if (!sessionId) return null;
    const previous = sessionManager.getSessionId();
    if (previous === sessionId) return sessionId;

    const phoneNumber = activeSocket?.user?.id
      ? activeSocket.user.id.split(':')[0].split('@')[0]
      : (pendingPairingPhone || sessionManager.getState().phoneNumber || '');

    sessionManager.setSessionId(sessionId, { authMethod, phoneNumber });
    console.log(`\n✅ Session id ${context === 'link' ? 'generated' : 'updated'} (${sessionId.length} chars).`);
    console.log('📦 Copy it into the SESSION_ID environment variable so the bot stays linked across restarts:');
    console.log(sessionId);
    console.log('');
    return sessionId;
  } catch (error) {
    console.error('[session] persist failed:', error?.message || error);
    return null;
  }
}

/** Wait until a socket's websocket is open (pairing codes require an open socket). */
async function waitForSocketOpen(sock, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!sock || sock !== activeSocket) return false;
    if (isSocketOpen(sock)) return true;
    await delay(400);
  }
  return isSocketOpen(sock);
}


/** Close the current socket cleanly so a new one never stacks on top of it. */
async function shutdownSocket(reason = 'restart') {
  const sock = activeSocket;
  activeSocket = null;
  activeAuthState = null;
  clearHealthMonitor();
  if (!sock) return;
  try {
    await Promise.race([sock.end(undefined, undefined, { reason }), delay(5000)]);
  } catch (error) {
    console.error('[socket] close failed:', error?.message || error);
  }
}

/** Single entry point for every reconnect - two sockets can never run at the same time. */
function scheduleReconnect(reason, minDelayMs = 0) {
  if (reconnectTimer) return;
  reconnectAttempts += 1;
  reconnectCount += 1;
  const backoff = Math.min(config.health.maxReconnectDelayMs, 3000 * Math.pow(1.6, Math.min(reconnectAttempts, 6)));
  const waitMs = Math.max(minDelayMs, Math.round(backoff + Math.random() * 1200));
  setupStatus = `Reconnecting in ${Math.round(waitMs / 1000)}s (${reason}).`;
  console.log(`♻️ [reconnect ${reconnectAttempts}] ${reason} - retrying in ${Math.round(waitMs / 1000)}s`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot(reason).catch((error) => {
      console.error('[reconnect] start failed:', error?.message || error);
      scheduleReconnect('retry-failed');
    });
  }, waitMs);
  if (typeof reconnectTimer.unref === 'function') reconnectTimer.unref();
}

/** Tear the current socket down and immediately build a fresh one. */
async function restartSocket(reason = 'manual') {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  await shutdownSocket(reason);
  await startBot(reason);
}

/** Record a fatal error and self-heal when the process keeps crashing. */
function recordCrash(source) {
  const now = Date.now();
  crashTimestamps = crashTimestamps.filter((stamp) => now - stamp < config.health.crashWindowMs);
  crashTimestamps.push(now);
  const windowMinutes = Math.round(config.health.crashWindowMs / 60000);
  console.warn(`⚠️ ${source} (${crashTimestamps.length}/${config.health.maxCrashesPerWindow} in the last ${windowMinutes} min).`);
  if (crashTimestamps.length >= config.health.maxCrashesPerWindow) {
    crashTimestamps = [];
    console.warn('⚠️ Crash loop detected - recycling the WhatsApp connection to self-heal.');
    setTimeout(() => {
      restartSocket('crash-loop').catch((error) => console.error('[self-heal] failed:', error?.message || error));
    }, 2000);
  }
}

// ---------------------------------------------------------------------------
// Health monitor - RAM guard, stale-socket detection, liveness probe, QR keep-alive
// ---------------------------------------------------------------------------
let healthCheckRunning = false;

function startHealthMonitor() {
async function runHealthCheck() {
  if (healthCheckRunning) return;
  healthCheckRunning = true;
  try {
    // 1) RAM guard - the most common reason free instances die silently
    const rssMb = process.memoryUsage().rss / (1024 * 1024);
    if (rssMb > config.health.memoryLimitMb) {
      console.warn(`⚠️ RAM at ${Math.round(rssMb)}MB (limit ${config.health.memoryLimitMb}MB). Cleaning up...`);
      try { cleanupOldFiles(); } catch (error) { /* ignore */ }
      try { handler.clearCaches(); } catch (error) { /* ignore */ }
      store.messages.clear();
      await delay(1500);
      const afterMb = process.memoryUsage().rss / (1024 * 1024);
      if (afterMb > config.health.memoryLimitMb) {
        console.warn(`⚠️ RAM still ${Math.round(afterMb)}MB - recycling the WhatsApp connection.`);
        await restartSocket('memory-limit');
        return;
      }
      console.log(`✅ RAM back to ${Math.round(afterMb)}MB.`);
    }

    const sock = activeSocket;
    if (!sock) {
      if (!startingSocket && !reconnectTimer) scheduleReconnect('no-socket');
      return;
    }

    // 2) A socket that never reported "close" but is not open anymore
    if (!isSocketOpen(sock)) {
      // Even when the socket isn't open, we still need to keep the QR alive
      // (this fixes the QR becoming null after 5-10 minutes during reconnects).
      const pairingActive = authMethod === 'pairing' && latestPairingCode &&
        (Date.now() - pairingCodeIssuedAt) < PAIRING_CODE_TTL_MS;
      if (!activeAuthState?.creds?.registered && !pairingActive) {
        const qrAge = latestQrIssuedAt ? Date.now() - latestQrIssuedAt : null;
        const socketAge = socketCreatedAt ? Date.now() - socketCreatedAt : 0;
        const stale = (qrAge !== null && qrAge > config.health.qrRefreshTimeoutMs) ||
          (qrAge === null && socketAge > config.health.qrRefreshTimeoutMs);
        if (stale && Date.now() - lastQrRestartAt > 20 * 1000) {
          lastQrRestartAt = Date.now();
          console.log('♻️ Socket stuck while unauthenticated - reconnecting for a fresh QR.');
          setupStatus = 'Refreshing the QR code...';
          await restartSocket('qr-stale-reconnect');
        }
      }
      if (Date.now() - lastServerTrafficAt > 90 * 1000) scheduleReconnect('socket-closed-silently');
      return;
    }

    // 3) Liveness probe after a long silence (presence updates never mark us online)
    if (Date.now() - lastServerTrafficAt > config.health.idleProbeMs) {
      try {
        await sock.sendPresenceUpdate('unavailable');
        failedProbes = 0;
        lastProbeAt = Date.now();
        lastServerTrafficAt = Date.now();
      } catch (error) {
        failedProbes += 1;
        lastSocketError = error?.message || String(error);
        console.warn(`⚠️ Connection probe failed (${failedProbes}/3): ${lastSocketError}`);
        if (failedProbes >= 3) {
          failedProbes = 0;
          await restartSocket('probe-failed');
          return;
        }
      }
    }

    // 4) Keep the QR code alive while waiting for a scan.
    //    Skip this when a pairing code is active so we don't invalidate it
    //    while the user is entering it on their phone.
    if (!activeAuthState?.creds?.registered) {
      const pairingActive = authMethod === 'pairing' && latestPairingCode &&
        (Date.now() - pairingCodeIssuedAt) < PAIRING_CODE_TTL_MS;
      if (pairingActive) {
        // Let the pairing code live — don't touch the socket.
      } else {
        const qrAge = latestQrIssuedAt ? Date.now() - latestQrIssuedAt : null;
        const socketAge = socketCreatedAt ? Date.now() - socketCreatedAt : 0;
        const stale = (qrAge !== null && qrAge > config.health.qrRefreshTimeoutMs) ||
          (qrAge === null && socketAge > config.health.qrRefreshTimeoutMs);
        if (stale && Date.now() - lastQrRestartAt > 20 * 1000) {
          lastQrRestartAt = Date.now();
          console.log('♻️ QR code went stale - restarting the connection for a fresh code.');
          setupStatus = 'Refreshing the QR code...';
          await restartSocket('qr-refresh');
        }
      }
    }
  } finally {
    healthCheckRunning = false;
  }
}

  clearHealthMonitor();
  healthMonitorTimer = setInterval(() => {
    runHealthCheck().catch((error) => console.error('[health] check failed:', error?.message || error));
  }, config.health.checkIntervalMs);
  if (typeof healthMonitorTimer.unref === 'function') healthMonitorTimer.unref();
}

function clearHealthMonitor() {
  if (healthMonitorTimer) {
    clearInterval(healthMonitorTimer);
    healthMonitorTimer = null;
  }
}

/** Welcome DM that carries the freshly generated session id. */
async function sendWelcomeMessage(sock, sessionId) {
  const userNumber = sock?.user?.id ? sock.user.id.split(':')[0].split('@')[0] : '';
  if (!userNumber) return false;
  const userJid = `${userNumber}@s.whatsapp.net`;
  const linkLabel = authMethod === 'pairing' ? 'pairing code' : authMethod === 'qr' ? 'QR code' : 'saved session';

  const lines = [
    `🎉 *Welcome to ${config.botName}!*`,
    '',
    `This WhatsApp account is now linked to *${config.botName}* using the ${linkLabel}.`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '🤖 *What this bot can do:*',
    '• 🛡️ Group moderation (anti-link, anti-spam, welcome/goodbye)',
    '• 🎨 Sticker maker, media tools and text effects',
    '• 🎮 Fun games and entertainment commands',
    '• 🤖 AI chat (Google Gemini with OpenRouter failover)',
    '• 📊 Account tools: privacy, archive, pin, mute, session id and health checks',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `⚡ *Prefix:* \`${config.prefix}\``,
    `📋 *Type* \`${config.prefix}menu\` *to see every command.*`,
    ''
  ];

  if (sessionId) {
    lines.push(
      '━━━━━━━━━━━━━━━━━━━━━━',
      '🔑 *YOUR SESSION ID*',
      '',
      'Keep this string safe. It is the login credential for this WhatsApp account and it is what lets the bot stay linked after a restart or redeploy.',
      '',
      sessionId,
      '',
      '⚠️ *Never share it with anyone.* Anyone who has it can control this WhatsApp account.',
      '💡 On Render, paste it into the `SESSION_ID` environment variable. You can also ask for it again with the `sessionid` command (owner only, private chat).',
      ''
    );
  }

  lines.push(`> _Powered by ${config.botName}_`);

  await sock.sendMessage(userJid, { text: lines.join('\n') });

  // Extra copy as a text file so it is easy to copy on a phone
  if (sessionId) {
    try {
      await sock.sendMessage(userJid, {
        document: Buffer.from(sessionId, 'utf8'),
        mimetype: 'text/plain',
        fileName: 'PoltergeistMD-session.txt',
        caption: '🗂️ Backup copy of your session id. Store it somewhere private.'
      });
    } catch (error) {
      console.error('[welcome] session file send failed:', error?.message || error);
    }
  }

  return true;
}

/** Ask WhatsApp for a pairing code, opening/awaiting a socket when needed. */
async function requestPairingCodeFor(rawPhoneNumber) {
  const phoneNumber = normalizePhoneNumber(rawPhoneNumber);

  if (pairingInFlight) throw new Error('A pairing request is already running. Please wait a moment.');
  if (Date.now() - pairingRequestAt < 5000) throw new Error('Please wait 5 seconds before requesting another pairing code.');
  if (activeAuthState?.creds?.registered) {
    throw new Error('This bot is already linked to a WhatsApp account. Unlink the device in WhatsApp first, then reload this page.');
  }

  // If a previous pairing code is still valid, return it instead of
  // hammering WhatsApp for a new one (prevents rate-limit errors).
  if (latestPairingCode && (Date.now() - pairingCodeIssuedAt) < PAIRING_CODE_TTL_MS && pendingPairingPhone === phoneNumber) {
    console.log(`📲 Reusing valid pairing code for ${phoneNumber}.`);
    return {
      code: latestPairingCode,
      phoneNumber,
      reused: true,
      expiresInSeconds: Math.max(0, Math.round((PAIRING_CODE_TTL_MS - (Date.now() - pairingCodeIssuedAt)) / 1000)),
      hint: 'WhatsApp > Linked devices > Link with phone number on that phone, then enter the code.'
    };
  }

  pairingInFlight = true;
  pairingRequestAt = Date.now();
  try {
    let sock = activeSocket;
    if (!sock || !isSocketOpen(sock)) {
      console.log('[pair] no open socket available - opening a fresh one for pairing');
      await restartSocket('pairing-request');
      sock = activeSocket;
    }
    if (!sock) throw new Error('Could not start a WhatsApp connection. Please try again in a few seconds.');

    if (!(await waitForSocketOpen(sock, 20000))) {
      throw new Error('The WhatsApp connection is still opening. Please wait a few seconds and try again.');
    }

    let code = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        code = await sock.requestPairingCode(phoneNumber);
        break;
      } catch (error) {
        lastError = error;
        const message = String(error?.message || '').toLowerCase();
        const transient = message.includes('close') || message.includes('connection') || message.includes('timeout') || message.includes('not open');
        if (!transient || attempt === 2) break;
        await delay(1500);
        if (!isSocketOpen(sock)) {
          await restartSocket('pairing-retry');
          sock = activeSocket;
          if (!sock || !(await waitForSocketOpen(sock, 15000))) break;
        }
      }
    }

    if (!code) throw lastError || new Error('WhatsApp did not return a pairing code. Please try again.');

    latestPairingCode = code;
    pairingCodeIssuedAt = Date.now();
    pendingPairingPhone = phoneNumber;
    authMethod = 'pairing';
    setupStatus = `Pairing code ready for ${phoneNumber}. Enter it in WhatsApp > Linked devices.`;
    sessionManager.setState({ authMethod: 'pairing', phoneNumber, pairingRequestedAt: pairingCodeIssuedAt });
    console.log(`📲 Pairing code generated for ${phoneNumber}.`);

    return {
      code,
      phoneNumber,
      expiresInSeconds: Math.round(PAIRING_CODE_TTL_MS / 1000),
      hint: 'WhatsApp > Linked devices > Link with phone number on that phone, then enter the code.'
    };
  } finally {
    pairingInFlight = false;
  }
}


// Main connection function - only ever called through scheduleReconnect()/restartSocket()
async function startBot(reason = 'startup') {
  if (startingSocket) {
    console.log('[socket] another start is already running, skipping');
    return;
  }
  startingSocket = true;
  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Always start from a clean slate: close the old socket and free message memory
    await shutdownSocket(reason);
    store.messages.clear();
    processedMessages.clear();

    prepareAuthFiles();
    const sessionFolder = sessionManager.getSessionFolder();
    if (!sessionManager.hasLocalCreds()) printHostedSetupMessage();

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch (error) {
      console.error('[socket] could not fetch the latest WA version, using the bundled one:', error?.message || error);
      version = undefined;
    }

    const sock = makeWASocket({
      version,
      logger: createSuppressedLogger('silent'),
      printQRInTerminal: false,
      // Browsers.ubuntu('Chrome') is what WhatsApp expects for requestPairingCode
      browser: Browsers.ubuntu('Chrome'),
      auth: state,
      // Memory optimisation: never load old messages/history into RAM
      syncFullHistory: false,
      downloadHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 2000,
      qrTimeout: 30000,
      getMessage: async () => undefined // Don't load messages from store
    });

    const generation = ++socketGeneration;
    sock.__generation = generation;
    activeSocket = sock;
    activeAuthState = state;
    socketCreatedAt = Date.now();
    socketOpenedAt = 0;
    lastServerTrafficAt = Date.now();
    failedProbes = 0;
    latestQrDataUrl = null;
    latestQrIssuedAt = 0;
    latestQrRaw = '';
    pairingReadyAt = Date.now() + 3000;

    if (state.creds.registered) {
      if (authMethod === 'none' || authMethod === 'qr') authMethod = 'session-file';
      setupStatus = 'Connecting with the saved session...';
    } else {
      if (authMethod !== 'pairing' && authMethod !== 'session-id') authMethod = 'qr';
      setupStatus = 'Waiting for QR scan or pairing code.';
    }

    /** Events from a socket that has already been replaced are ignored. */
    const isCurrent = () => sock.__generation === socketGeneration && activeSocket === sock;

    require('./commands/general/reminder').setSocket(sock);

    // Bind the in-memory message store
    store.bind(sock.ev);

    // Every event from WhatsApp proves the connection is alive
    for (const event of [
      'messages.upsert',
      'messages.update',
      'message-receipt.update',
      'presence.update',
      'creds.update',
      'groups.update',
      'group-participants.update',
      'contacts.update',
      'chats.update',
      'call'
    ]) {
      try {
        sock.ev.on(event, () => {
          if (isCurrent()) lastServerTrafficAt = Date.now();
        });
      } catch (error) {
        // Event not supported by this Baileys version - safe to ignore
      }
    }

    startHealthMonitor();

    // Connection lifecycle (QR / open / close) - one listener per socket
    sock.ev.on('connection.update', async (update) => {
      if (!isCurrent()) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          latestQrDataUrl = await qrImage.toDataURL(qr, { width: 360, margin: 2 });
        } catch (error) {
          latestQrDataUrl = null;
          console.error('[qr] could not render the QR image:', error?.message || error);
        }
        latestQrRaw = qr;
        latestQrIssuedAt = Date.now();
        qrCount += 1;
        setupStatus = (authMethod === 'pairing' && pendingPairingPhone)
          ? `Waiting for the pairing code of ${pendingPairingPhone} to be entered.`
          : 'Waiting for QR scan or pairing code.';
        console.log(`\n📱 QR code #${qrCount} ready. Scan it with WhatsApp, or request a pairing code from the setup page:\n`);
        try { qrcode.generate(qr, { small: true }); } catch (error) { /* terminal render is best effort */ }
        console.log('');
      }

      if (connection === 'open') {
        socketOpenedAt = Date.now();
        reconnectAttempts = 0;
        failedProbes = 0;
        latestQrDataUrl = null;
        latestQrIssuedAt = 0;
        latestQrRaw = '';
        setupStatus = 'Connected.';

        const botNumber = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : '';
        const pendingNumber = pendingPairingPhone.replace(/\D/g, '');
        if (pendingNumber && botNumber && (botNumber.endsWith(pendingNumber.slice(-8)) || pendingNumber.endsWith(botNumber.slice(-8)))) {
          authMethod = 'pairing';
          pairingCompletedAt = Date.now();
        } else if (authMethod === 'none') {
          authMethod = 'session-file';
        }
        pendingPairingPhone = '';
        latestPairingCode = null;
        pairingCodeIssuedAt = 0;

        console.log(`\n✅ ${config.botName} connected successfully!`);
        console.log(`📱 Bot Number: ${botNumber || 'unknown'}`);
        console.log(`🚀 Linked via: ${authMethod}`);
        console.log(`🤖 Bot Name: ${config.botName}`);
        console.log(`⚡ Prefix: ${config.prefix}`);
        const ownerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
        console.log(`👑 Owner: ${ownerNames}`);
        console.log('Bot is ready to receive messages!\n');

        // 1) Generate + persist the session id for this freshly linked account.
        //    A short delay ensures saveCreds() has flushed the latest creds to disk,
        //    so exportSessionFromDisk() captures the complete session.
        let sessionId = null;
        if (config.sessionAutoSave) {
          await delay(800);
          sessionId = persistSession('link');
        }
        if (!sessionId) sessionId = sessionManager.getSessionId() || null;

        // 2) Deliver the session id together with the welcome message (once per pairing)
        if (config.sendWelcomeOnConnect && sessionId && sessionManager.needsWelcome(sessionId)) {
          try {
            if (await sendWelcomeMessage(sock, sessionId)) {
              sessionManager.markWelcomeSent(sessionId);
              lastWelcomeSessionId = sessionId;
              console.log('📩 Welcome message + session id delivered to the linked number.');
            }
          } catch (error) {
            console.error('Welcome message error:', error?.message || error);
          }
        } else if (!config.sendWelcomeOnConnect) {
          console.log('ℹ️ Welcome message disabled (SEND_WELCOME=false).');
        }

        if (config.autoBio) {
          try { await sock.updateProfileStatus(`${config.botName} | Active 24/7`); } catch (error) { /* best effort */ }
        }

        // Drop chats that have been quiet for more than a day
        const now = Date.now();
        for (const [jid, chatMsgs] of store.messages.entries()) {
          const timestamps = Array.from(chatMsgs.values()).map(m => (m.messageTimestamp || 0) * 1000 || 0);
          if (timestamps.length > 0 && now - Math.max(...timestamps) > 24 * 60 * 60 * 1000) {
            store.messages.delete(jid);
          }
        }
        return;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
        lastDisconnectReason = `${statusCode || 'n/a'}: ${errorMessage}`;
        clearHealthMonitor();

        // WhatsApp unlinked this device (or the session was revoked elsewhere)
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          console.warn('⚠️ WhatsApp unlinked this device. Clearing the stored session so a new pairing can be made.');
          sessionManager.clearLocalCreds();
          sessionManager.setState({ sessionId: '', authMethod: 'none', phoneNumber: '', lastWelcomedSessionId: '', pairingRequestedAt: 0 });
          config.sessionID = '';
          latestQrDataUrl = null;
          latestQrIssuedAt = 0;
          if (config.autoRelinkOnLogout) {
            authMethod = 'qr';
            setupStatus = 'Logged out. Scan the new QR code (or request a pairing code) to link again.';
            scheduleReconnect('logged-out', 5000);
          } else {
            authMethod = 'none';
            setupStatus = 'Logged out. Add a new SESSION_ID or restart the service to pair again.';
            console.warn('⚠️ AUTO_RELINK is disabled, so the bot will stay offline now.');
          }
          return;
        }

        setupStatus = `Connection closed (${statusCode || 'unknown'}). Reconnecting...`;
        if ([515, 503, 408, 428, 500, 502].includes(statusCode)) {
          console.log(`⚠️ Connection closed (${statusCode}). Reconnecting...`);
        } else {
          console.log('Connection closed due to:', errorMessage);
        }
        scheduleReconnect(`close-${statusCode || 'unknown'}`, 2000);
      }
    });

    // Credentials update handler - keeps the session id fresh after every write
    sock.ev.on('creds.update', async () => {
      if (!isCurrent()) return;
      try {
        await saveCreds();
      } catch (error) {
        console.error('[creds] save failed:', error?.message || error);
      }
      if (config.sessionAutoSave) {
        try { persistSession('update'); } catch (error) { /* already logged */ }
      }
    });

  // System JID filter - checks if JID is from broadcast/status/newsletter
  const isSystemJid = (jid) => {
    if (!jid) return true;
    return jid.includes('@broadcast') ||
      jid.includes('status.broadcast') ||
      jid.includes('@newsletter') ||
      jid.includes('@newsletter.');
  };

  // Messages handler - Process only new messages
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (!isCurrent()) return;
    // Only process "notify" type (new messages), skip "append" (old messages from history)
    if (type !== 'notify') return;

    // Process messages in the array
    for (const msg of messages) {
      // Skip if message is invalid or missing key
      if (!msg.message || !msg.key?.id) continue;

      const from = msg.key.remoteJid;
      if (!from) {
        continue;
      }

      // System message filter - ignore broadcast/status/newsletter messages
      if (isSystemJid(from)) {
        continue; // Silently ignore system messages
      }

      // Deduplication: Skip if message has already been processed
      const msgId = msg.key.id;
      if (processedMessages.has(msgId)) continue;

      // Timestamp validation: Only process messages within last 5 minutes
      const MESSAGE_AGE_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds
      let messageAge = 0;
      if (msg.messageTimestamp) {
        messageAge = Date.now() - (msg.messageTimestamp * 1000);
        if (messageAge > MESSAGE_AGE_LIMIT) {
          // Message is too old, skip processing
          continue;
        }
      }

      // Mark message as processed
      processedMessages.add(msgId);

      // Store message FIRST (before processing)
      // from already defined above in DM block check
      if (msg.key && msg.key.id) {
        if (!store.messages.has(from)) {
          store.messages.set(from, new Map());
        }
        const chatMsgs = store.messages.get(from);
        chatMsgs.set(msg.key.id, msg);

        // Cleanup: Keep only last 20 per chat (reduced from 200)
        if (chatMsgs.size > store.maxPerChat) {
          // Remove oldest messages
          const sortedIds = Array.from(chatMsgs.entries())
            .sort((a, b) => (a[1].messageTimestamp || 0) - (b[1].messageTimestamp || 0))
            .map(([id]) => id);
          for (let i = 0; i < sortedIds.length - store.maxPerChat; i++) {
            chatMsgs.delete(sortedIds[i]);
          }
        }
      }

      // Process command IMMEDIATELY (don't block on other operations)
      handler.handleMessage(sock, msg).catch(err => {
        if (!err.message?.includes('rate-overlimit') &&
          !err.message?.includes('not-authorized')) {
          console.error('Error handling message:', err.message);
        }
      });

      // Do other operations in background (non-blocking)
      setImmediate(async () => {
        if (config.autoRead && from.endsWith('@g.us')) {
          try {
            await sock.readMessages([msg.key]);
          } catch (e) {
            // Silently handle
          }
        }
        if (from.endsWith('@g.us')) {
          try {
            const groupMetadata = await handler.getGroupMetadata(sock, msg.key.remoteJid);
            if (groupMetadata) {
              await handler.handleAntilink(sock, msg, groupMetadata);
            }
          } catch (error) {
            // Silently handle
          }
        }
      });
    }
  });

  // Message receipt updates (silently handled, no logging)
  sock.ev.on('message-receipt.update', () => {
    // Silently handle receipt updates
  });

  // Message updates (silently handled, no logging)
  sock.ev.on('messages.update', () => {
    // Silently handle message updates
  });

  // Group participant updates (join/leave)
  sock.ev.on('group-participants.update', async (update) => {
    if (!isCurrent()) return;
    try {
      await handler.handleGroupUpdate(sock, update);
    } catch (error) {
      console.error('[group update] failed:', error?.message || error);
    }
  });

  // Handle errors - suppress common stream errors
  sock.ev.on('error', (error) => {
    if (!isCurrent()) return;
    lastSocketError = error?.message || String(error);
    const statusCode = error?.output?.statusCode;
    // Suppress verbose output for common stream errors
    if (statusCode === 515 || statusCode === 503 || statusCode === 408) {
      // These are usually temporary connection issues, handled by reconnection
      return;
    }
    console.error('Socket error:', error.message || error);
  });

    return sock;
  } catch (error) {
    lastSocketError = error?.message || String(error);
    console.error('[socket] start failed:', lastSocketError);
    setupStatus = 'Connection failed. Retrying...';
    scheduleReconnect('start-failed', 5000);
    return null;
  } finally {
    startingSocket = false;
  }
}
// Start the bot
console.log('🚀 Starting WhatsApp MD Bot...\n');
console.log(`📦 Bot Name: ${config.botName}`);
console.log(`⚡ Prefix: ${config.prefix}`);
const startupOwnerNames = Array.isArray(config.ownerName) ? config.ownerName.join(',') : config.ownerName;
console.log(`👑 Owner: ${startupOwnerNames}\n`);

const startupSession = sessionManager.getStatus();
console.log(startupSession.hasSession
  ? `📡 Stored session found (${startupSession.sessionPreview}, linked via ${startupSession.authMethod}).`
  : '📡 No stored session yet - the setup page will show a QR code to scan or a pairing code to request.');
console.log('');

// Proactively delete Puppeteer cache so it doesn't fill disk on panels
cleanupPuppeteerCache();

startSetupServer();
startBot('startup').catch(err => {
  console.error('Error starting bot:', err);
  scheduleReconnect('startup-failed', 5000);
});

// ---------------------------------------------------------------------------
// Global guards - the process must survive crashes and unhandled rejections
// ---------------------------------------------------------------------------
const isDiskFullError = (err) => Boolean(err) && (
  err.code === 'ENOSPC' ||
  err.errno === -28 ||
  String(err.message || '').includes('no space left on device')
);

process.on('uncaughtException', (err) => {
  if (isDiskFullError(err)) {
    console.error('⚠️ ENOSPC: no space left on device. Running cleanup...');
    try { cleanupOldFiles(); } catch (error) { /* ignore */ }
    return; // Don't crash, just log and continue
  }
  console.error('Uncaught Exception:', err);
  recordCrash('uncaughtException');
});

process.on('unhandledRejection', (err) => {
  if (isDiskFullError(err)) {
    console.warn('⚠️ ENOSPC in promise: no space left on device. Running cleanup...');
    try { cleanupOldFiles(); } catch (error) { /* ignore */ }
    return;
  }

  const message = String(err?.message || err || '');
  if (message.includes('rate-overlimit')) {
    console.warn('⚠️ Rate limit reached. Please slow down your requests.');
    return;
  }
  if (message.includes('not-authorized') || message.includes('Connection Closed') || message.includes('Connection Terminated')) {
    // The reconnect logic already deals with these
    return;
  }

  console.error('Unhandled Rejection:', err);
  recordCrash('unhandledRejection');
});

// ---------------------------------------------------------------------------
// Graceful shutdown - save the session before Render stops the instance
// ---------------------------------------------------------------------------
let shuttingDown = false;

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Saving session and shutting down...`);

  try { clearHealthMonitor(); } catch (error) { /* ignore */ }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    if (sessionManager.hasLocalCreds()) persistSession('shutdown');
  } catch (error) { /* ignore */ }
  try { stopCleanup(); } catch (error) { /* ignore */ }

  const sock = activeSocket;
  activeSocket = null;
  if (sock) {
    try {
      // Hard timeout: even if the socket hangs, force-exit so Render can kill
      // and restart the instance instead of hanging forever.
      await Promise.race([sock.end(undefined, undefined, { reason: 'shutdown' }), delay(5000)]);
    } catch (error) { /* ignore */ }
  }

  try { database.flushAll(); } catch (error) { /* ignore */ }
  console.log('👋 Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => { gracefulShutdown('SIGINT'); });
process.on('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.on('SIGUSR2', () => { gracefulShutdown('SIGUSR2'); });

// Last-resort flush so a redeploy never loses pending database writes
process.on('exit', () => {
  try { database.flushAll(); } catch (error) { /* ignore */ }
});

// Export store + connection stats for use in commands
module.exports = { store, connectionStats };
