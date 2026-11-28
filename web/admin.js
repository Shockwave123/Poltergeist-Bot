import * as THREE from 'three';
import { Lenis } from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

class AdminApp {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.cursorGlow = document.getElementById('cursor-glow');
    this.loginScreen = document.getElementById('login-screen');
    this.dashboard = document.getElementById('dashboard');
    this.loginForm = document.getElementById('login-form');
    this.passwordInput = document.getElementById('admin-password');
    this.loginButton = document.getElementById('login-button');
    this.loginError = document.getElementById('login-error');
    this.pairForm = document.getElementById('pair-form');
    this.pairButton = document.getElementById('pair-button');
    this.pairMessage = document.getElementById('pair-message');
    this.pairCodeCard = document.getElementById('pair-code-card');
    this.qrImage = document.getElementById('qr-image');
    this.qrPlaceholder = document.getElementById('qr-placeholder');
    this.connectionBanner = document.getElementById('connection-banner');
    this.connectionPill = document.getElementById('connection-pill');
    this.stateOrb = document.getElementById('state-orb');
    this.stateLabel = document.getElementById('state-label');
    this.refreshButton = document.getElementById('refresh-button');
    this.togglePasswordBtn = document.getElementById('toggle-password');

    this.timers = { qr: null, pairing: null };
    this.pollTimer = null;
    this.polling = false;
    this.authenticated = false;

    this.three = { scene: null, camera: null, renderer: null, particles: null, time: 0 };
    this.lenis = null;
    this.animations = new Map();

    this.init();
  }

  async init() {
    this.initCursor();
    this.initThreeJS();
    this.initLenis();
    this.initGSAP();
    this.bindEvents();
    await this.checkSession();
    this.animateThreeJS();
  }

  initCursor() {
    if (prefersReducedMotion) return;

    const cursor = this.cursorGlow;
    let mouseX = 0, mouseY = 0;
    let currentX = 0, currentY = 0;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      cursor.style.opacity = '1';
      cursor.classList.add('active');
    });

    document.addEventListener('mouseleave', () => {
      cursor.style.opacity = '0';
      cursor.classList.remove('active', 'hover');
    });

    document.addEventListener('mousedown', () => cursor.classList.add('click'));
    document.addEventListener('mouseup', () => cursor.classList.remove('click'));

    document.querySelectorAll('a, button, input, [data-magnetic], [data-tilt]').forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
    });

    const lerp = (a, b, t) => a + (b - a) * t;
    const animateCursor = () => {
      currentX = lerp(currentX, mouseX, 0.15);
      currentY = lerp(currentY, mouseY, 0.15);
      cursor.style.transform = `translate(${currentX - 20}px, ${currentY - 20}px)`;
      requestAnimationFrame(animateCursor);
    };
    animateCursor();
  }

  initThreeJS() {
    if (prefersReducedMotion) {
      this.canvas.style.display = 'none';
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const particleCount = window.innerWidth < 768 ? 1500 : 3000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const velocities = new Float32Array(particleCount * 3);
    const phases = new Float32Array(particleCount);

    const cyanColor = new THREE.Color(0x5bf4e6);
    const violetColor = new THREE.Color(0xc47aff);
    const pinkColor = new THREE.Color(0xf45bda);
    const blueColor = new THREE.Color(0x58d9ff);

    for (let i = 0; i < particleCount; i++) {
      const radius = 15 + Math.random() * 35;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const colorChoice = Math.random();
      let color;
      if (colorChoice < 0.35) color = cyanColor;
      else if (colorChoice < 0.65) color = violetColor;
      else if (colorChoice < 0.85) color = pinkColor;
      else color = blueColor;

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = 0.5 + Math.random() * 2.5;
      velocities[i * 3] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
      phases[i] = Math.random() * Math.PI * 2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const gridGeometry = new THREE.BufferGeometry();
    const gridPositions = new Float32Array(2400);
    const gridColors = new Float32Array(2400);
    let gi = 0;
    for (let i = -30; i <= 30; i++) {
      for (let j = -30; j <= 30; j++) {
        if (i === 0 || j === 0) continue;
        gridPositions[gi++] = i * 3;
        gridPositions[gi++] = j * 3;
        gridPositions[gi++] = -20;
        gridPositions[gi++] = (i + 1) * 3;
        gridPositions[gi++] = j * 3;
        gridPositions[gi++] = -20;
        gridPositions[gi++] = i * 3;
        gridPositions[gi++] = (j + 1) * 3;
        gridPositions[gi++] = -20;
        gridPositions[gi++] = (i + 1) * 3;
        gridPositions[gi++] = (j + 1) * 3;
        gridPositions[gi++] = -20;
      }
    }
    for (let i = 0; i < 800; i++) {
      gridColors[i * 3] = 0.35;
      gridColors[i * 3 + 1] = 0.95;
      gridColors[i * 3 + 2] = 0.9;
    }
    gridGeometry.setAttribute('position', new THREE.BufferAttribute(gridPositions, 3));
    gridGeometry.setAttribute('color', new THREE.BufferAttribute(gridColors, 3));
    const gridMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.04, depthWrite: false });
    const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
    scene.add(grid);

    this.three = { scene, camera, renderer, particles, grid, time: 0 };

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const { camera, renderer } = this.three;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animateThreeJS() {
    if (prefersReducedMotion) return;

    const { scene, camera, renderer, particles, grid, time } = this.three;
    this.three.time += 0.01;

    if (particles) {
      const positions = particles.geometry.attributes.position.array;
      const velocities = particles.geometry.attributes.velocity.array;
      const phases = particles.geometry.attributes.phase.array;
      const count = positions.length / 3;

      for (let i = 0; i < count; i++) {
        const phase = phases[i] + this.three.time * 0.5;
        positions[i * 3] += velocities[i * 3] + Math.sin(phase) * 0.0015;
        positions[i * 3 + 1] += velocities[i * 3 + 1] + Math.cos(phase) * 0.0015;
        positions[i * 3 + 2] += velocities[i * 3 + 2];

        const dist = Math.sqrt(
          positions[i * 3] ** 2 + positions[i * 3 + 1] ** 2 + positions[i * 3 + 2] ** 2
        );
        if (dist > 60) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const radius = 15 + Math.random() * 35;
          positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
          positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
          positions[i * 3 + 2] = radius * Math.cos(phi);
        }
      }
      particles.geometry.attributes.position.needsUpdate = true;
      particles.rotation.y += 0.0001;
      particles.rotation.x += 0.00005;
    }

    if (grid) {
      grid.rotation.z += 0.00008;
      grid.rotation.x += 0.00003;
    }

    camera.position.x = Math.sin(this.three.time * 0.1) * 2;
    camera.position.y = Math.cos(this.three.time * 0.08) * 1.5;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(() => this.animateThreeJS());
  }

  initLenis() {
    if (prefersReducedMotion) return;

    this.lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      gestureDirection: 'vertical',
      smooth: true,
      smoothTouch: false,
      touchMultiplier: 2
    });

    this.lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => {
      this.lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  initGSAP() {
    gsap.config({ nullTargetWarn: false, trialWarn: false });

    const revealElements = document.querySelectorAll('[data-reveal]');
    revealElements.forEach((el, index) => {
      const delay = parseFloat(el.dataset.delay || 0) / 1000;
      gsap.fromTo(el,
        { opacity: 0, y: 30, filter: 'blur(8px)' },
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.8,
          delay: delay + index * 0.06,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 90%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    });

    const magneticElements = document.querySelectorAll('[data-magnetic]');
    magneticElements.forEach(el => {
      el.addEventListener('mousemove', (e) => {
        if (prefersReducedMotion) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        gsap.to(el, { x: x * 0.15, y: y * 0.15, duration: 0.3, ease: 'power2.out' });
      });
      el.addEventListener('mouseleave', () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
      });
    });

    const tiltElements = document.querySelectorAll('[data-tilt]');
    tiltElements.forEach(el => {
      el.addEventListener('mousemove', (e) => {
        if (prefersReducedMotion) return;
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        gsap.to(el, {
          rotationY: x * 8,
          rotationX: -y * 8,
          duration: 0.3,
          ease: 'power2.out',
          transformPerspective: 1000
        });
      });
      el.addEventListener('mouseleave', () => {
        gsap.to(el, { rotationY: 0, rotationX: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
      });
    });

    gsap.to('.visual-orb', {
      y: '+=20',
      duration: 3,
      ease: 'sine.inOut',
      stagger: 0.5,
      repeat: -1,
      yoyo: true
    });

    gsap.to('.account-glow', {
      opacity: 0.6,
      duration: 2.5,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true
    });
  }

  bindEvents() {
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    this.togglePasswordBtn.addEventListener('click', () => this.togglePassword());
    this.pairForm.addEventListener('submit', (e) => this.handlePair(e));
    this.refreshButton.addEventListener('click', () => this.handleRefresh());
    document.getElementById('logout-button').addEventListener('click', () => this.handleLogout());

    this.passwordInput.addEventListener('focus', () => this.passwordInput.parentElement.classList.add('focused'));
    this.passwordInput.addEventListener('blur', () => this.passwordInput.parentElement.classList.remove('focused'));
    document.getElementById('phone-number').addEventListener('focus', (e) => e.target.parentElement.classList.add('focused'));
    document.getElementById('phone-number').addEventListener('blur', (e) => e.target.parentElement.classList.remove('focused'));

    document.querySelectorAll('.button').forEach(btn => {
      btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.98)');
      btn.addEventListener('mouseup', () => btn.style.transform = '');
      btn.addEventListener('mouseleave', () => btn.style.transform = '');
    });
  }

  async api(url, options = {}) {
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

  async checkSession() {
    try {
      const session = await this.api('/api/session');
      if (!session.configured) {
        this.showLogin('Admin login is unavailable. Configure SETUP_PASSWORD with at least 16 characters.');
      } else if (session.authenticated) {
        this.showDashboard();
        this.startPolling();
      } else {
        this.showLogin();
      }
    } catch (error) {
      this.showLogin(error.message || 'Could not reach the bot server.');
    }
  }

  showLogin(message = '', success = false) {
    this.authenticated = false;
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    this.dashboard.classList.add('hidden');
    this.loginScreen.classList.remove('hidden');
    this.loginError.textContent = message;
    this.loginError.classList.toggle('visible', !!message);
    this.loginError.classList.toggle('success', success);
    this.passwordInput.focus();

    gsap.fromTo(this.loginScreen, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
  }

  showDashboard() {
    this.authenticated = true;
    this.loginScreen.classList.add('hidden');
    this.dashboard.classList.remove('hidden');
    this.loginError.textContent = '';
    this.loginError.classList.remove('visible', 'success');

    gsap.fromTo(this.dashboard, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });

    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('visible'));
  }

  togglePassword() {
    const showing = this.passwordInput.type === 'text';
    this.passwordInput.type = showing ? 'password' : 'text';
    this.togglePasswordBtn.querySelector('.btn-text').textContent = showing ? 'SHOW' : 'HIDE';
    this.togglePasswordBtn.querySelector('.btn-icon').style.transform = showing ? 'rotate(0deg)' : 'rotate(180deg)';
    this.togglePasswordBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    this.togglePasswordBtn.setAttribute('aria-pressed', showing ? 'false' : 'true');
  }

  formatUptime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    return `${minutes}m ${value % 60}s`;
  }

  formatCountdown(seconds) {
    const remaining = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  }

  setConnectionState(kind, title, detail) {
    this.connectionBanner.className = `connection-banner state-${kind}`;
    document.getElementById('banner-title').textContent = title;
    document.getElementById('banner-detail').textContent = detail;
    this.connectionPill.classList.toggle('is-online', kind === 'online');
    this.connectionPill.classList.toggle('is-error', kind === 'error');
    this.connectionPill.querySelector('span').textContent = kind === 'online' ? 'ONLINE' : kind === 'error' ? 'OFFLINE' : 'WAITING';
    this.stateOrb.classList.toggle('is-online', kind === 'online');
    this.stateOrb.classList.toggle('is-error', kind === 'error');
    this.stateLabel.textContent = kind === 'online' ? 'Connected' : kind === 'error' ? 'Disconnected' : 'Waiting';
  }

  renderStatus(data) {
    const linked = Boolean(data.linked);
    const connected = Boolean(data.connected);
    const pairing = data.pairing && data.pairing.code ? data.pairing : null;

    if (linked && connected) {
      this.setConnectionState('online', 'BOT CONNECTED', 'WhatsApp is linked and the bot is online.');
    } else if (pairing) {
      this.setConnectionState('wait', 'PAIRING CODE READY', 'Enter the one-time code in WhatsApp to finish linking.');
    } else if (data.qr) {
      this.setConnectionState('wait', 'QR CODE READY', 'Scan the current QR code using Linked devices in WhatsApp.');
    } else if (connected) {
      this.setConnectionState('wait', 'SOCKET CONNECTED', 'Waiting for WhatsApp to issue a fresh linking code.');
    } else {
      this.setConnectionState('error', 'WAITING FOR CONNECTION', data.status || 'The bot is reconnecting or starting up.');
    }

    const qrAvailable = Boolean(data.qr) && !linked;
    this.qrImage.classList.toggle('hidden', !qrAvailable);
    this.qrPlaceholder.classList.toggle('hidden', qrAvailable);
    if (qrAvailable && this.qrImage.getAttribute('src') !== data.qr) this.qrImage.setAttribute('src', data.qr);

    document.getElementById('qr-caption').textContent = linked
      ? 'QR linking is no longer needed.'
      : qrAvailable
        ? `Code generated ${Number.isFinite(data.qrAgeSeconds) ? `${data.qrAgeSeconds}s ago` : 'just now'}. Scan the code currently shown.`
        : 'QR codes refresh automatically when available.';

    this.timers.qr = Number.isFinite(data.qrRefreshSeconds) && !linked ? data.qrRefreshSeconds : null;

    this.pairCodeCard.classList.toggle('hidden', !pairing || linked);
    if (pairing && !linked) {
      document.getElementById('pair-code').textContent = pairing.code;
      document.getElementById('pair-code-countdown').textContent = `Expires in ${pairing.expiresInSeconds || 0}s`;
      this.timers.pairing = Number(pairing.expiresInSeconds) || 0;
      const progressBar = this.pairCodeCard.querySelector('.pair-code-progress span');
      if (progressBar) {
        progressBar.style.animation = 'none';
        progressBar.offsetHeight;
        progressBar.style.animation = 'progress-drain 180s linear forwards';
      }
    } else {
      this.timers.pairing = null;
    }

    document.getElementById('session-tag').textContent = data.sessionReady ? 'SESSION STORED' : 'NO SESSION';
    document.getElementById('bot-number').textContent = linked && data.botNumber ? `+${data.botNumber}` : 'Not linked';
    document.getElementById('session-detail').textContent = data.sessionReady
      ? 'Session credential is stored. This page never displays it.'
      : 'Link a device to create a saved session.';
    document.getElementById('uptime-value').textContent = this.formatUptime(data.uptimeSeconds);
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
    document.getElementById('memory-fill').setAttribute('aria-valuenow', memoryPercent);

    document.getElementById('last-updated').textContent = `UPDATED ${new Date().toLocaleTimeString()}`;
    document.getElementById('qr-countdown').textContent = this.timers.qr === null ? '--:--' : this.formatCountdown(this.timers.qr);
  }

  async pollStatus() {
    if (!this.authenticated || this.polling) return;
    this.polling = true;
    try {
      this.renderStatus(await this.api('/api/status'));
    } catch (error) {
      if (error.status === 401) {
        this.showLogin('Your admin session expired. Sign in again to continue.');
      } else {
        this.setConnectionState('error', 'STATUS UNAVAILABLE', error.message);
      }
    } finally {
      this.polling = false;
    }
  }

  startPolling() {
    if (this.pollTimer) window.clearInterval(this.pollTimer);
    this.pollStatus();
    this.pollTimer = window.setInterval(() => this.pollStatus(), 3000);
  }

  async handleLogin(event) {
    event.preventDefault();
    this.loginError.textContent = '';
    this.loginError.classList.remove('visible', 'success');

    if (!this.passwordInput.value || this.passwordInput.value.length < 16) {
      this.loginError.textContent = 'Password must be at least 16 characters.';
      this.loginError.classList.add('visible');
      this.passwordInput.focus();
      gsap.fromTo(this.loginError, { x: -10 }, { x: 0, duration: 0.3, ease: 'power2.out' });
      return;
    }

    this.loginButton.classList.add('loading');
    this.loginButton.disabled = true;

    try {
      await this.api('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: this.passwordInput.value })
      });
      this.passwordInput.value = '';
      this.showDashboard();
      this.startPolling();
    } catch (error) {
      this.loginError.textContent = error.message;
      this.loginError.classList.add('visible');
    } finally {
      this.loginButton.classList.remove('loading');
      this.loginButton.disabled = false;
    }
  }

  async handlePair(event) {
    event.preventDefault();
    this.pairMessage.textContent = '';
    this.pairMessage.classList.remove('visible', 'success');

    const phoneInput = document.getElementById('phone-number');
    const phoneNumber = phoneInput.value.replace(/\D/g, '');

    if (!phoneNumber || phoneNumber.length < 8 || phoneNumber.length > 15) {
      this.pairMessage.textContent = 'Enter a valid phone number (8-15 digits with country code).';
      this.pairMessage.classList.add('visible');
      phoneInput.focus();
      return;
    }

    this.pairButton.classList.add('loading');
    this.pairButton.disabled = true;

    try {
      const result = await this.api('/api/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      document.getElementById('pair-code').textContent = result.code;
      document.getElementById('pair-code-countdown').textContent = `Expires in ${result.expiresInSeconds || 120}s`;
      this.pairCodeCard.classList.remove('hidden');
      this.pairMessage.textContent = `Device-link notification sent to +${result.phoneNumber || phoneNumber}.`;
      this.pairMessage.classList.add('visible', 'success');
      this.timers.pairing = Number(result.expiresInSeconds) || 120;
      await this.pollStatus();
    } catch (error) {
      this.pairMessage.textContent = error.message;
      this.pairMessage.classList.add('visible');
    } finally {
      this.pairButton.classList.remove('loading');
      this.pairButton.disabled = false;
    }
  }

  async handleRefresh() {
    this.refreshButton.classList.add('loading');
    this.refreshButton.disabled = true;

    try {
      const result = await this.api('/api/refresh', { method: 'POST' });
      this.pairMessage.textContent = result.message || 'Requesting a fresh QR code…';
      this.pairMessage.classList.remove('success');
      this.pairMessage.classList.add('visible');
      window.setTimeout(() => this.pollStatus(), 1800);
    } catch (error) {
      this.pairMessage.textContent = error.message;
      this.pairMessage.classList.add('visible');
    } finally {
      window.setTimeout(() => {
        this.refreshButton.classList.remove('loading');
        this.refreshButton.disabled = false;
      }, 1200);
    }
  }

  async handleLogout() {
    try {
      await this.api('/api/logout', { method: 'POST' });
    } catch (error) {
      this.loginError.textContent = error.message;
    }
    this.showLogin('You have been signed out.', true);
  }

  updateTimers() {
    if (this.timers.qr !== null) {
      this.timers.qr = Math.max(0, this.timers.qr - 1);
      document.getElementById('qr-countdown').textContent = this.timers.qr > 0 ? this.formatCountdown(this.timers.qr) : 'REFRESHING';
    }
    if (this.timers.pairing !== null) {
      this.timers.pairing = Math.max(0, this.timers.pairing - 1);
      const countdownEl = document.getElementById('pair-code-countdown');
      if (countdownEl) {
        countdownEl.textContent = this.timers.pairing > 0
          ? `Expires in ${this.timers.pairing}s`
          : 'Code expired — request another';
      }
      const progressBar = this.pairCodeCard.querySelector('.pair-code-progress span');
      if (progressBar && this.timers.pairing === 0) {
        progressBar.style.animation = 'none';
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.adminApp = new AdminApp();
  setInterval(() => window.adminApp?.updateTimers(), 1000);
});