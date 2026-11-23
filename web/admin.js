(() => {
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const passwordInput = document.getElementById('admin-password');
  const loginButton = document.getElementById('login-button');
  const loginError = document.getElementById('login-error');
  const pairForm = document.getElementById('pair-form');
  const pairButton = document.getElementById('pair-button');
  const pairMessage = document.getElementById('pair-message');
  const pairCodeCard = document.getElementById('pair-code-card');
  const qrImage = document.getElementById('qr-image');
  const qrPlaceholder = document.getElementById('qr-placeholder');
  const connectionBanner = document.getElementById('connection-banner');
  const connectionPill = document.getElementById('connection-pill');
  const stateOrb = document.getElementById('state-orb');
  const stateLabel = document.getElementById('state-label');
  const refreshButton = document.getElementById('refresh-button');
  const timers = { qr: null, pairing: null };
  let pollTimer = null;
  let polling = false;
  let authenticated = false;

  async function api(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showLogin(message = '', success = false) {
    authenticated = false;
    if (pollTimer) window.clearInterval(pollTimer);
    dashboard.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginError.textContent = message;
    loginError.classList.toggle('success', success);
    passwordInput.focus();
  }

  function showDashboard() {
    authenticated = true;
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loginError.textContent = '';
    loginError.classList.remove('success');
  }

  function formatUptime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    return `${minutes}m ${value % 60}s`;
  }

  function formatCountdown(seconds) {
    const remaining = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  }

  function setConnectionState(kind, title, detail) {
    connectionBanner.className = `connection-banner state-${kind}`;
    document.getElementById('banner-title').textContent = title;
    document.getElementById('banner-detail').textContent = detail;
    connectionPill.classList.toggle('is-online', kind === 'online');
    connectionPill.classList.toggle('is-error', kind === 'error');
    connectionPill.querySelector('span').textContent = kind === 'online' ? 'ONLINE' : kind === 'error' ? 'OFFLINE' : 'WAITING';
    stateOrb.classList.toggle('is-online', kind === 'online');
    stateOrb.classList.toggle('is-error', kind === 'error');
    stateLabel.textContent = kind === 'online' ? 'Connected' : kind === 'error' ? 'Disconnected' : 'Waiting';
  }

  function renderStatus(data) {
    const linked = Boolean(data.linked);
    const connected = Boolean(data.connected);
    const pairing = data.pairing && data.pairing.code ? data.pairing : null;

    if (linked && connected) {
      setConnectionState('online', 'BOT CONNECTED', 'WhatsApp is linked and the bot is online.');
    } else if (pairing) {
      setConnectionState('wait', 'PAIRING CODE READY', 'Enter the one-time code in WhatsApp to finish linking.');
    } else if (data.qr) {
      setConnectionState('wait', 'QR CODE READY', 'Scan the current QR code using Linked devices in WhatsApp.');
    } else if (connected) {
      setConnectionState('wait', 'SOCKET CONNECTED', 'Waiting for WhatsApp to issue a fresh linking code.');
    } else {
      setConnectionState('error', 'WAITING FOR CONNECTION', data.status || 'The bot is reconnecting or starting up.');
    }

    const qrAvailable = Boolean(data.qr) && !linked;
    qrImage.classList.toggle('hidden', !qrAvailable);
    qrPlaceholder.classList.toggle('hidden', qrAvailable);
    if (qrAvailable && qrImage.getAttribute('src') !== data.qr) qrImage.setAttribute('src', data.qr);
    document.getElementById('qr-caption').textContent = linked
      ? 'QR linking is no longer needed.'
      : qrAvailable
        ? `Code generated ${Number.isFinite(data.qrAgeSeconds) ? `${data.qrAgeSeconds}s ago` : 'just now'}. Scan the code currently shown.`
        : 'QR codes refresh automatically when available.';
    timers.qr = Number.isFinite(data.qrRefreshSeconds) && !linked ? data.qrRefreshSeconds : null;

    pairCodeCard.classList.toggle('hidden', !pairing || linked);
    if (pairing && !linked) {
      document.getElementById('pair-code').textContent = pairing.code;
      document.getElementById('pair-code-countdown').textContent = `Expires in ${pairing.expiresInSeconds || 0}s`;
      timers.pairing = Number(pairing.expiresInSeconds) || 0;
    } else {
      timers.pairing = null;
    }

    document.getElementById('session-tag').textContent = data.sessionReady ? 'SESSION STORED' : 'NO SESSION';
    document.getElementById('bot-number').textContent = linked && data.botNumber ? `+${data.botNumber}` : 'Not linked';
    document.getElementById('session-detail').textContent = data.sessionReady
      ? 'Session credential is stored. This page never displays it.'
      : 'Link a device to create a saved session.';
    document.getElementById('uptime-value').textContent = formatUptime(data.uptimeSeconds);
    document.getElementById('reconnect-value').textContent = String(data.reconnects ?? '—');
    document.getElementById('auth-value').textContent = String(data.authMethod || 'Not linked').replace(/-/g, ' ');
    document.getElementById('status-value').textContent = data.status || 'Unknown';
    document.getElementById('disconnect-value').textContent = data.lastDisconnectReason || 'None';

    const memory = Number(data.memoryMb);
    const memoryLimit = Number(data.memoryLimitMb);
    const memoryPercent = memoryLimit > 0 && Number.isFinite(memory) ? Math.min(100, Math.round((memory / memoryLimit) * 100)) : 0;
    document.getElementById('memory-value').textContent = Number.isFinite(memory) && memoryLimit > 0
      ? `${memory} / ${memoryLimit} MB · ${memoryPercent}%`
      : 'Unavailable';
    document.getElementById('memory-fill').style.width = `${memoryPercent}%`;
    document.getElementById('last-updated').textContent = `UPDATED ${new Date().toLocaleTimeString()}`;
    document.getElementById('qr-countdown').textContent = timers.qr === null ? '--:--' : formatCountdown(timers.qr);
  }

  async function pollStatus() {
    if (!authenticated || polling) return;
    polling = true;
    try {
      renderStatus(await api('/api/status'));
    } catch (error) {
      if (error.status === 401) {
        showLogin('Your admin session expired. Sign in again to continue.');
      } else {
        setConnectionState('error', 'STATUS UNAVAILABLE', error.message);
      }
    } finally {
      polling = false;
    }
  }

  function startPolling() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollStatus();
    pollTimer = window.setInterval(pollStatus, 3000);
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.textContent = '';
    loginError.classList.remove('success');
    loginButton.disabled = true;
    loginButton.querySelector('span').textContent = 'Authenticating…';
    try {
      await api('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value })
      });
      passwordInput.value = '';
      showDashboard();
      startPolling();
    } catch (error) {
      loginError.textContent = error.message;
    } finally {
      loginButton.disabled = false;
      loginButton.querySelector('span').textContent = 'Unlock control center';
    }
  });

  document.getElementById('toggle-password').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    button.textContent = showing ? 'SHOW' : 'HIDE';
    button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });

  pairForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    pairMessage.textContent = '';
    pairButton.disabled = true;
    pairButton.querySelector('span').textContent = 'Requesting code…';
    const phoneNumber = document.getElementById('phone-number').value.replace(/\D/g, '');
    try {
      const result = await api('/api/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      document.getElementById('pair-code').textContent = result.code;
      document.getElementById('pair-code-countdown').textContent = `Expires in ${result.expiresInSeconds || 120}s`;
      pairCodeCard.classList.remove('hidden');
      pairMessage.textContent = `Device-link notification sent to +${result.phoneNumber || phoneNumber}.`;
      timers.pairing = Number(result.expiresInSeconds) || 120;
      await pollStatus();
    } catch (error) {
      pairMessage.textContent = error.message;
    } finally {
      pairButton.disabled = false;
      pairButton.querySelector('span').textContent = 'Generate pairing code';
    }
  });

  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    refreshButton.querySelector('span').textContent = 'Refreshing connection…';
    try {
      const result = await api('/api/refresh', { method: 'POST' });
      pairMessage.textContent = result.message || 'Requesting a fresh QR code…';
      window.setTimeout(pollStatus, 1800);
    } catch (error) {
      pairMessage.textContent = error.message;
    } finally {
      window.setTimeout(() => {
        refreshButton.disabled = false;
        refreshButton.querySelector('span').textContent = 'Request a fresh QR';
      }, 1200);
    }
  });

  document.getElementById('logout-button').addEventListener('click', async () => {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch (error) {
      loginError.textContent = error.message;
    }
    showLogin('You have been signed out.', true);
  });

  window.setInterval(() => {
    if (timers.qr !== null) {
      timers.qr = Math.max(0, timers.qr - 1);
      document.getElementById('qr-countdown').textContent = timers.qr > 0 ? formatCountdown(timers.qr) : 'REFRESHING';
    }
    if (timers.pairing !== null) {
      timers.pairing = Math.max(0, timers.pairing - 1);
      document.getElementById('pair-code-countdown').textContent = timers.pairing > 0
        ? `Expires in ${timers.pairing}s`
        : 'Code expired — request another';
    }
  }, 1000);

  api('/api/session')
    .then((session) => {
      if (!session.configured) {
        showLogin('Admin login is unavailable. Configure SETUP_PASSWORD with at least 16 characters.');
      } else if (session.authenticated) {
        showDashboard();
        startPolling();
      } else {
        showLogin();
      }
    })
    .catch((error) => showLogin(error.message || 'Could not reach the bot server.'));
})();
