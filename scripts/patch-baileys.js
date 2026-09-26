#!/usr/bin/env node
/**
 * Patches the pinned @whiskeysockets/baileys build with the fixes this bot
 * needs to link a phone at all.
 *
 * Why this exists
 * ---------------
 * Around 2026-07-28 WhatsApp added a stage to companion registration: after
 * the QR is scanned the server sends
 *     <notification type="companion_reg_refresh">
 * which retires the adv secret the QR currently advertises. Baileys 7.0.0-rc14
 * (the newest release on npm) acks that notification and drops it, so the QR
 * keeps offering a retired secret, `pair-success` never arrives and the phone
 * reports "Couldn't link device". Neither the QR nor the pairing-code flow can
 * complete. See WhiskeySockets/Baileys#2737 and the unmerged fix PR #2765.
 *
 * This script ports PR #2765 (plus the #2602 guard that stops
 * `link_code_companion_reg` responses without crypto fields from crashing the
 * pairing-code path with `Boom('Invalid buffer', 400)`) onto the compiled
 * package that npm installs.
 *
 * When it runs
 * ------------
 *  - `postinstall` during `npm install` (so Render applies it at deploy time)
 *  - at bot startup, before `require('@whiskeysockets/baileys')` in index.js
 *
 * It is idempotent: every edit is skipped when its marker is already present.
 * The Baileys version is pinned to exactly 7.0.0-rc14 in package.json because
 * these edits match that build's compiled output.
 */

const fs = require('fs');
const path = require('path');

const EXPECTED_VERSION = '7.0.0-rc14';
const BAILEYS_DIR = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys');

const readVersion = () => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(BAILEYS_DIR, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch (error) {
    return null;
  }
};

/**
 * Apply one anchored edit. Returns { label, status } where status is one of
 * 'ok' | 'already' | 'no-match' | 'missing-file'.
 */
const applyEdit = ({ file, label, marker, find, replace }) => {
  const fullPath = path.join(BAILEYS_DIR, file);
  if (!fs.existsSync(fullPath)) return { label, status: 'missing-file' };
  const text = fs.readFileSync(fullPath, 'utf8');
  if (text.includes(marker)) return { label, status: 'already' };
  // Respect the file's line endings (npm tarballs and Windows checkouts differ).
  let needle = find;
  let insert = replace;
  if (text.includes('\r\n') && needle.includes('\n')) {
    needle = needle.replace(/\n/g, '\r\n');
    insert = insert.replace(/\r?\n/g, '\r\n');
  }
  const idx = text.indexOf(needle);
  if (idx === -1) return { label, status: 'no-match' };
  // Replace only the first occurrence, then re-check the marker.
  const next = text.slice(0, idx) + insert + text.slice(idx + needle.length);
  if (!next.includes(marker)) return { label, status: 'no-match' };
  fs.writeFileSync(fullPath, next, 'utf8');
  return { label, status: 'ok' };
};

// ---------------------------------------------------------------------------
// Edit 1 - Utils/companion-reg-client-utils.js
//   - import crypto + the binary-node helper
//   - add makePairingQRRenderer (re-render the ref already on screen without
//     draining the ref pool) and handleCompanionRegRefresh (rotate the adv
//     secret the server retired, persist it, re-render the QR)
// ---------------------------------------------------------------------------
const COMPANION_UTILS_IMPORTS = [
  "import { randomBytes } from 'crypto';",
  "import { getBinaryNodeChild } from '../WABinary/index.js';"
].join('\n');

const COMPANION_UTILS_HELPERS = [
  '/**',
  ' * Holds the ref currently on screen so it can be re-rendered.',
  ' *',
  ' * `render` is called with the ref rather than a finished payload so the caller',
  ' * can read the adv secret at render time: a `companion_reg_refresh` rotates it',
  ' * mid-flow, and every QR emitted afterwards has to advertise the new value.',
  ' */',
  'export const makePairingQRRenderer = (refs, render) => {',
  '    let index = 0;',
  '    let current;',
  '    return {',
  '        next() {',
  '            const ref = refs[index];',
  '            if (ref === undefined) {',
  '                return false;',
  '            }',
  '            index += 1;',
  '            current = ref;',
  '            render(ref);',
  '            return true;',
  '        },',
  '        refresh() {',
  '            if (current === undefined) {',
  '                return false;',
  '            }',
  '            render(current);',
  '            return true;',
  '        }',
  '    };',
  '};',
  "/** The two children WA Web's parser accepts on this notification. */",
  "const COMPANION_REG_REFRESH_CHILDREN = ['companion_reg_refresh', 'pair-device-rotate-qr'];",
  '/**',
  ' * `<notification type="companion_reg_refresh">` - the server retiring an',
  " * unpaired companion's registration material (WhatsApp server-side change",
  ' * from late July 2026, see WhiskeySockets/Baileys#2737).',
  ' *',
  ' * The adv secret is one of the four fields buildPairingQRData encodes, so a',
  ' * client that only acks keeps offering a QR built on a secret the server has',
  ' * already retired: the phone scans it, reports a failed link, and no',
  ' * pair-success ever arrives.',
  ' *',
  ' * The ack itself is unchanged - the generic notification path already sends',
  ' * it - this only adds the rotation and the re-render.',
  ' */',
  'export const handleCompanionRegRefresh = (node, { creds, emitCredsUpdate, refreshQR, logger }) => {',
  '    if (!COMPANION_REG_REFRESH_CHILDREN.some(tag => getBinaryNodeChild(node, tag))) {',
  "        logger.warn({ node }, 'companion_reg_refresh carries neither expected child; ignoring');",
  "        return 'ignored_malformed';",
  '    }',
  '    // WA Web rotates unconditionally; a registered session is the one case',
  '    // where that is wrong here. `creds.me` is set by pair-success and by',
  '    // requestPairingCode, and in both cases the adv secret is what a completed',
  '    // or pending pairing is verified against - re-minting it would break the',
  '    // session rather than refresh a pending registration.',
  '    if (creds.me) {',
  "        logger.debug({ id: node.attrs.id }, 'companion_reg_refresh on a registered session; keeping the adv secret');",
  "        return 'ignored_registered';",
  '    }',
  "    // Same construction as initAuthCreds: 32 CSPRNG bytes, base64.",
  "    creds.advSecretKey = randomBytes(32).toString('base64');",
  '    emitCredsUpdate({ advSecretKey: creds.advSecretKey });',
  '    // warn (not info) so the rotation is visible in Render\'s logs at the bot',
  "    // default `warn` log level - the key line when pairing is being debugged.",
  "    logger.warn({ id: node.attrs.id }, 'rotated the adv secret the server asked to retire; re-rendering the pairing QR');",
  '    refreshQR();',
  "    return 'rotated';",
  '};'
].join('\n');

// ---------------------------------------------------------------------------
// Edit 2 - Socket/socket.js: QR renderer + companion_reg_refresh listener
// ---------------------------------------------------------------------------
const SOCKET_QR_OLD = [
  '    // QR gen',
  "    ws.on('CB:iq,type:set,pair-device', async (stanza) => {",
  '        const iq = {',
  "            tag: 'iq',",
  '            attrs: {',
  '                to: S_WHATSAPP_NET,',
  "                type: 'result',",
  '                id: stanza.attrs.id',
  '            }',
  '        };',
  '        await sendNode(iq);',
  "        const pairDeviceNode = getBinaryNodeChild(stanza, 'pair-device');",
  "        const refNodes = getBinaryNodeChildren(pairDeviceNode, 'ref');",
  "        const noiseKeyB64 = Buffer.from(creds.noiseKey.public).toString('base64');",
  "        const identityKeyB64 = Buffer.from(creds.signedIdentityKey.public).toString('base64');",
  '        const advB64 = creds.advSecretKey;',
  '        let qrMs = qrTimeout || 60000; // time to let a QR live',
  '        const genPairQR = () => {',
  '            if (!ws.isOpen) {',
  '                return;',
  '            }',
  '            const refNode = refNodes.shift();',
  '            if (!refNode) {',
  "                void end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));",
  '                return;',
  '            }',
  "            const ref = refNode.content.toString('utf-8');",
  '            const qr = buildPairingQRData(ref, noiseKeyB64, identityKeyB64, advB64, browser);',
  "            ev.emit('connection.update', { qr });",
  '            qrTimer = setTimeout(genPairQR, qrMs);',
  '            qrMs = qrTimeout || 20000; // shorter subsequent qrs',
  '        };',
  '        genPairQR();',
  '    });'
].join('\n');

const SOCKET_QR_NEW = [
  '    // Re-render the QR currently on screen. Set while a pairing QR flow is',
  '    // live on this connection, undefined otherwise.',
  '    let refreshPairingQR;',
  '    // QR gen',
  "    ws.on('CB:iq,type:set,pair-device', async (stanza) => {",
  '        const iq = {',
  "            tag: 'iq',",
  '            attrs: {',
  '                to: S_WHATSAPP_NET,',
  "                type: 'result',",
  '                id: stanza.attrs.id',
  '            }',
  '        };',
  '        await sendNode(iq);',
  "        const pairDeviceNode = getBinaryNodeChild(stanza, 'pair-device');",
  "        const refNodes = getBinaryNodeChildren(pairDeviceNode, 'ref');",
  "        const noiseKeyB64 = Buffer.from(creds.noiseKey.public).toString('base64');",
  "        const identityKeyB64 = Buffer.from(creds.signedIdentityKey.public).toString('base64');",
  '        // creds.advSecretKey is read per render rather than captured once:',
  '        // a companion_reg_refresh rotates it mid-flow.',
  '        const renderer = makePairingQRRenderer(',
  "            refNodes.map(refNode => refNode.content.toString('utf-8')),",
  '            ref => ev.emit(',
  "                'connection.update',",
  '                { qr: buildPairingQRData(ref, noiseKeyB64, identityKeyB64, creds.advSecretKey, browser) }',
  '            )',
  '        );',
  '        refreshPairingQR = () => void renderer.refresh();',
  '        let qrMs = qrTimeout || 60000; // time to let a QR live',
  '        const genPairQR = () => {',
  '            if (!ws.isOpen) {',
  '                return;',
  '            }',
  '            if (!renderer.next()) {',
  "                void end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));",
  '                return;',
  '            }',
  '            qrTimer = setTimeout(genPairQR, qrMs);',
  '            qrMs = qrTimeout || 20000; // shorter subsequent qrs',
  '        };',
  '        genPairQR();',
  '    });',
  '    // The server retiring an unpaired companion registration material:',
  '    // rotate the adv secret and re-render the ref already on screen (upstream',
  '    // PR WhiskeySockets/Baileys#2765). Without this the QR keeps advertising',
  '    // a retired secret and linking always fails with "Couldn\'t link device".',
  "    ws.on('CB:notification,type:companion_reg_refresh', (node) => {",
  '        handleCompanionRegRefresh(node, {',
  '            creds,',
  "            emitCredsUpdate: update => ev.emit('creds.update', update),",
  '            refreshQR: () => refreshPairingQR?.(),',
  '            logger',
  '        });',
  '    });'
].join('\n');

const SOCKET_IMPORT_OLD = 'getNextPreKeysNode, makeEventBuffer, makeNoiseHandler, promiseTimeout,';
const SOCKET_IMPORT_NEW = 'getNextPreKeysNode, handleCompanionRegRefresh, makeEventBuffer, makeNoiseHandler, makePairingQRRenderer, promiseTimeout,';

// ---------------------------------------------------------------------------
// Edit 3 - Socket/messages-recv.js: don't crash on a link_code_companion_reg
// response that carries no crypto fields (WhiskeySockets/Baileys#2602). That
// Boom('Invalid buffer', 400) used to abort the pairing-code flow mid-handshake.
// ---------------------------------------------------------------------------
const LINK_CODE_MARKER = "if (!getBinaryNodeChildBuffer(linkCodeCompanionReg, 'primary_identity_pub')) { break; }";
const LINK_CODE_FIND = "                const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg');";
const LINK_CODE_REPLACE = `${LINK_CODE_FIND}\n                ${LINK_CODE_MARKER} // #2602: empty/errored shape must not crash the pairing-code path`;

const EDITS = [
  {
    file: 'lib/Utils/companion-reg-client-utils.js',
    label: 'companion-reg-client-utils: imports',
    marker: "import { getBinaryNodeChild } from '../WABinary/index.js';",
    find: 'export var CompanionWebClientType;',
    replace: `${COMPANION_UTILS_IMPORTS}\nexport var CompanionWebClientType;`
  },
  {
    file: 'lib/Utils/companion-reg-client-utils.js',
    label: 'companion-reg-client-utils: refresh handlers',
    marker: 'handleCompanionRegRefresh',
    find: '//# sourceMappingURL=companion-reg-client-utils.js.map',
    replace: `${COMPANION_UTILS_HELPERS}\n//# sourceMappingURL=companion-reg-client-utils.js.map`
  },
  {
    file: 'lib/Socket/socket.js',
    label: 'socket: import refresh handlers',
    marker: 'makePairingQRRenderer',
    find: SOCKET_IMPORT_OLD,
    replace: SOCKET_IMPORT_NEW
  },
  {
    file: 'lib/Socket/socket.js',
    label: 'socket: QR renderer + companion_reg_refresh listener',
    marker: "ws.on('CB:notification,type:companion_reg_refresh'",
    find: SOCKET_QR_OLD,
    replace: SOCKET_QR_NEW
  },
  {
    file: 'lib/Socket/messages-recv.js',
    label: 'messages-recv: link_code_companion_reg guard',
    marker: LINK_CODE_MARKER,
    find: LINK_CODE_FIND,
    replace: LINK_CODE_REPLACE
  }
];

/**
 * Apply every edit that is not applied yet.
 * @returns {{ok: boolean, skipped: boolean, results: Array<{label: string, status: string}>}}
 */
const applyBaileysPatch = ({ silent } = {}) => {
  const log = (...args) => { if (!silent) console.log(...args); };

  if (!fs.existsSync(BAILEYS_DIR)) {
    log('[baileys-patch] @whiskeysockets/baileys is not installed yet - nothing to patch.');
    return { ok: true, skipped: true, results: [] };
  }

  const version = readVersion();
  if (!version) {
    log('[baileys-patch] could not read the installed Baileys version - attempting the patch anyway.');
  } else if (version !== EXPECTED_VERSION) {
    log(`[baileys-patch] WARNING: installed Baileys is ${version}, but this patch targets ${EXPECTED_VERSION}. Attempting anyway; if an edit does not apply, pin "${EXPECTED_VERSION}" in package.json.`);
  }

  const results = EDITS.map(applyEdit);
  const failed = results.filter(r => r.status === 'no-match' || r.status === 'missing-file');

  if (failed.length) {
    log('[baileys-patch] FAILED to apply:');
    failed.forEach(r => log(`   - ${r.label}: ${r.status}`));
    log('[baileys-patch] QR / pairing-code linking will NOT work until this is resolved.');
  }

  const applied = results.filter(r => r.status === 'ok');
  if (applied.length) {
    log(`[baileys-patch] applied ${applied.length} edit(s):`);
    applied.forEach(r => log(`   - ${r.label}`));
  } else if (!failed.length) {
    log('[baileys-patch] already patched (companion_reg_refresh fix present).');
  }

  return { ok: failed.length === 0, skipped: false, results };
};

module.exports = { applyBaileysPatch, EXPECTED_VERSION, EDITS };

if (require.main === module) {
  const result = applyBaileysPatch();
  process.exitCode = result.ok ? 0 : 1;
}





