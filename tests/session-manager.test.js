/**
 * Regression test for the "pairing code rejected / couldn't link device" bug.
 *
 * Why it exists
 * -------------
 * Baileys 7 writes `me` + `pairingCode` into creds.json as soon as
 * `requestPairingCode()` is called, while `registered: true` is only set later, when
 * WhatsApp acknowledges `companion_finish`. This bot used to:
 *   - treat that half-linked file as a saved session (`isUsableCreds` only looked for
 *     key material), so it exported/printed a session id for a device that was never
 *     registered, and
 *   - keep re-using it on every boot, which makes Baileys send a LOGIN node instead of
 *     a REGISTRATION node (Socket/socket.js keys the choice off `creds.me`), so the
 *     phone permanently answered "Couldn't link device".
 *
 * A creds file is now only a session when `registered === true`. These assertions run
 * without any dependency on WhatsApp or the network.
 *
 * Usage: npm test   (or: node tests/session-manager.test.js)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const TMP_SESSION_NAME = `session-test-${process.pid}`;
const TMP_SESSION_DIR = path.join(ROOT_DIR, TMP_SESSION_NAME);
const TMP_STATE_FILE = path.join(ROOT_DIR, 'database', `session-test-${process.pid}.json`);

// Point both persistent paths at throwaway files BEFORE loading the module so the real
// session/creds.json and database/session.json are never touched.
process.env.SESSION_STATE_FILE = TMP_STATE_FILE;

const config = require('../config');
config.sessionName = TMP_SESSION_NAME;

const sessionManager = require('../utils/sessionManager');

const CREDS_FILE = sessionManager.getCredsFile();

let failures = 0;
let checks = 0;

const suite = (name, fn) => {
  console.log(`\n${name}`);
  try {
    fn();
  } catch (error) {
    failures += 1;
    console.error(`  ❌ suite threw: ${error.message}`);
  }
};

const check = (label, fn) => {
  checks += 1;
  try {
    fn();
    console.log(`  ✅ ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ❌ ${label}\n     → ${error.message}`);
  }
};

const writeCreds = (creds) => {
  fs.mkdirSync(TMP_SESSION_DIR, { recursive: true });
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds));
};

const resetSessionFolder = () => {
  fs.rmSync(TMP_SESSION_DIR, { recursive: true, force: true });
  if (fs.existsSync(TMP_STATE_FILE)) fs.rmSync(TMP_STATE_FILE, { force: true });
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const keyMaterial = () => ({
  noiseKey: { keyPair: { public: 'noise-pub', private: 'noise-priv' } },
  identityKey: { public: 'identity-pub', private: 'identity-priv' },
  signedPreKey: { keyPair: { public: 'signed-pub', private: 'signed-priv' }, keyId: 1, signature: 'sig' },
  advSecretKey: 'adv-secret',
  registrationId: 123456
});

/** Exactly what Baileys leaves behind after requestPairingCode() on a failed attempt. */
const halfLinkedCreds = () => ({
  ...keyMaterial(),
  registered: false,
  pairingCode: 'ABCD2345',
  me: { id: '2348012345678@s.whatsapp.net', name: '~' }
});

/** A creds.json WhatsApp has actually confirmed (companion_finish acknowledged). */
const linkedCreds = () => ({
  ...keyMaterial(),
  registered: true,
  me: { id: '2348012345678:5@s.whatsapp.net', name: 'Poltergeist' },
  platform: 'chrome'
});

/**
 * A *QR*-linked account, exactly as Baileys persists it: pair-success adds the account
 * signature + signal identities but never sets `registered`. Neither v6.7.x nor
 * v7.0.0-rc14 set that flag outside the pairing-code path, so a session like this must
 * still be recognised - treating it as "unlinked" would log the user out.
 */
const qrLinkedCreds = () => ({
  ...keyMaterial(),
  registered: false,
  me: { id: '2348012345678:5@s.whatsapp.net', name: 'Poltergeist' },
  account: { details: 'device-details', accountSignatureKey: 'sig-key', accountSignature: 'sig' },
  signalIdentities: [{ identifier: { name: '2348012345678:5@s.whatsapp.net', deviceId: 5 }, identifierKey: 'key' }]
});

/** Same as linkedCreds, but serialised the way useMultiFileAuthState does (BufferJSON). */
const linkedCredsWithBuffers = () => {
  const buf = (value) => ({ type: 'Buffer', data: Buffer.from(value).toString('base64') });
  return {
    ...linkedCreds(),
    noiseKey: { keyPair: { public: buf('noise-pub'), private: buf('noise-priv') } },
    identityKey: { public: buf('identity-pub'), private: buf('identity-priv') },
    signedPreKey: { keyPair: { public: buf('signed-pub'), private: buf('signed-priv') }, keyId: 1, signature: buf('sig') }
  };
};

console.log('🔎 sessionManager pairing-mode regression test');

// ---------------------------------------------------------------------------
suite('1. A truncated creds.json is still detected and quarantined', () => {
  resetSessionFolder();
  writeCreds({ me: { id: '2348012345678@s.whatsapp.net' } });

  check('hasBrokenCreds() is true', () => {
    if (!sessionManager.hasBrokenCreds()) throw new Error('expected broken creds to be reported');
  });
  check('hasLocalCreds() is false', () => {
    if (sessionManager.hasLocalCreds()) throw new Error('placeholder must not count as a session');
  });
  check('isLinkedCreds() is false', () => {
    if (sessionManager.isLinkedCreds(sessionManager.readCredsRaw())) throw new Error('placeholder must not be linked');
  });
  check('quarantineBrokenCreds() moves the file aside', () => {
    if (!sessionManager.quarantineBrokenCreds()) throw new Error('quarantine returned false');
    if (fs.existsSync(CREDS_FILE)) throw new Error('creds.json should no longer be loadable by Baileys');
    const leftovers = fs.readdirSync(TMP_SESSION_DIR).filter((name) => name.includes('.broken-'));
    if (leftovers.length !== 1) throw new Error(`expected 1 quarantined file, found ${leftovers.length}`);
  });
});

// ---------------------------------------------------------------------------
suite('2. A half-linked creds.json (the pairing-code failure) is not a session', () => {
  resetSessionFolder();
  writeCreds(halfLinkedCreds());
  const raw = sessionManager.readCredsRaw();

  check('isUsableCreds() is true (key material intact, Baileys will not crash)', () => {
    if (!sessionManager.isUsableCreds(raw)) throw new Error('key material should be recognised');
  });
  check('isLinkedCreds() is false (never registered)', () => {
    if (sessionManager.isLinkedCreds(raw)) throw new Error('registered=false must not be linked');
  });
  check('isLinkedCredsObject() is false for the in-memory creds shape', () => {
    if (sessionManager.isLinkedCredsObject(halfLinkedCreds())) throw new Error('half-linked creds object must not be linked');
  });
  check('hasLocalCreds() is false', () => {
    if (sessionManager.hasLocalCreds()) throw new Error('half-linked creds must not be used as a session');
  });
  check('hasBrokenCreds() is false (incomplete, not corrupt)', () => {
    if (sessionManager.hasBrokenCreds()) throw new Error('half-linked creds should not be quarantined');
  });
  check('exportSessionFromDisk() refuses to mint a session id', () => {
    if (sessionManager.exportSessionFromDisk() !== null) throw new Error('a dead session id must never be exported');
  });
  check('importSessionToDisk() refuses a half-linked session id', () => {
    const sessionId = sessionManager.encodeCreds(raw);
    if (sessionManager.importSessionToDisk(sessionId)) throw new Error('a half-linked session id must be refused');
  });
  check('importSessionToDisk() refuses a registered placeholder without key material', () => {
    const placeholder = sessionManager.encodeCreds(JSON.stringify({ me: { id: 'x@s.whatsapp.net' }, registered: true }));
    if (sessionManager.importSessionToDisk(placeholder)) throw new Error('placeholder must be refused');
  });
  check('getStatus() does not advertise a stored session', () => {
    const status = sessionManager.getStatus();
    if (status.hasSession || status.credsOnDisk || status.credsLinked) {
      throw new Error(`status should report no session, got ${JSON.stringify(status)}`);
    }
  });
});

// ---------------------------------------------------------------------------
suite('3. A genuinely linked account keeps working (no regression)', () => {
  resetSessionFolder();
  writeCreds(linkedCreds());

  check('isLinkedCreds() / hasLocalCreds() are true', () => {
    if (!sessionManager.isLinkedCreds(sessionManager.readCredsRaw())) throw new Error('linked creds not recognised');
    if (!sessionManager.hasLocalCreds()) throw new Error('linked creds must count as a session');
  });
  check('isLinkedCredsObject() is true for the in-memory creds shape', () => {
    if (!sessionManager.isLinkedCredsObject(linkedCreds())) throw new Error('linked creds object must be linked');
  });
  check('hasBrokenCreds() is false', () => {
    if (sessionManager.hasBrokenCreds()) throw new Error('linked creds must not be quarantined');
  });

  let exported = null;
  check('exportSessionFromDisk() produces a PoltergeistMD! session id', () => {
    exported = sessionManager.exportSessionFromDisk();
    if (!sessionManager.isSessionIdValid(exported)) throw new Error(`unexpected export: ${exported}`);
  });
  check('the exported session id decodes back to the linked creds', () => {
    const decoded = JSON.parse(sessionManager.decodeSessionId(exported));
    if (decoded.registered !== true) throw new Error('decoded creds are not registered');
    if (!sessionManager.isLinkedCreds(sessionManager.decodeSessionId(exported))) {
      throw new Error('decoded creds must validate as linked');
    }
  });
  check('importSessionToDisk() accepts the session id and records it', () => {
    if (!sessionManager.importSessionToDisk(exported, { authMethod: 'session-file', phoneNumber: '2348012345678' })) {
      throw new Error('a linked session id must be importable');
    }
    if (sessionManager.getSessionId() !== exported) throw new Error('session id was not recorded in the state file');
    if (!sessionManager.hasLocalCreds()) throw new Error('creds must still be linked after import');
  });
});

// ---------------------------------------------------------------------------
suite('4. Baileys BufferJSON creds (real on-disk shape) are recognised', () => {
  resetSessionFolder();
  writeCreds(linkedCredsWithBuffers());

  check('hasLocalCreds() is true for BufferJSON-serialised creds', () => {
    if (!sessionManager.hasLocalCreds()) throw new Error('BufferJSON creds must be recognised');
  });
  check('exportSessionFromDisk() still works', () => {
    if (!sessionManager.isSessionIdValid(sessionManager.exportSessionFromDisk())) {
      throw new Error('BufferJSON creds should still export');
    }
  });
});

suite('5. A QR-linked session (Baileys never sets `registered`) is still a session', () => {
  resetSessionFolder();
  writeCreds(qrLinkedCreds());

  check('isLinkedCreds() is true', () => {
    if (!sessionManager.isLinkedCreds(sessionManager.readCredsRaw())) {
      throw new Error('a QR-linked account must be recognised (registered stays false in Baileys)');
    }
  });
  check('hasLocalCreds() is true', () => {
    if (!sessionManager.hasLocalCreds()) throw new Error('a QR-linked account must count as a session');
  });
  check('hasBrokenCreds() is false (so the session is never quarantined)', () => {
    if (sessionManager.hasBrokenCreds()) throw new Error('a QR-linked account must not be quarantined');
  });
  check('isLinkedCredsObject() is true for the in-memory creds shape', () => {
    if (!sessionManager.isLinkedCredsObject(qrLinkedCreds())) throw new Error('QR-linked creds object must be linked');
  });
  check('exportSessionFromDisk() still mints a session id', () => {
    if (!sessionManager.isSessionIdValid(sessionManager.exportSessionFromDisk())) {
      throw new Error('a QR-linked account must still export');
    }
  });
  check('importSessionToDisk() still accepts that session id', () => {
    const sessionId = sessionManager.exportSessionFromDisk();
    if (!sessionManager.importSessionToDisk(sessionId, { authMethod: 'session-file' })) {
      throw new Error('a QR-linked session id must stay importable');
    }
  });
});

// ---------------------------------------------------------------------------
resetSessionFolder();

console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`} (${checks} assertions)`);
if (failures > 0) process.exitCode = 1;
