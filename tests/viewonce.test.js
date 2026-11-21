const assert = require('node:assert/strict');
const viewOnce = require('../commands/general/viewonce');
const messageStore = require('../utils/messageStore');

const image = {
  imageMessage: {
    viewOnce: true,
    mediaKey: Buffer.from('media-key'),
    directPath: '/media/path'
  }
};

assert.ok(viewOnce.aliases.includes('wow'));
assert.deepEqual(
  viewOnce.getViewOnceMedia({
    ephemeralMessage: {
      message: {
        viewOnceMessageV2Extension: {
          message: image
        }
      }
    }
  }),
  { messageType: 'imageMessage', message: image }
);
assert.deepEqual(
  viewOnce.getViewOnceMedia({
    videoMessage: { viewOnce: true, mediaKey: Buffer.from('video-key') }
  }),
  {
    messageType: 'videoMessage',
    message: {
      videoMessage: { viewOnce: true, mediaKey: Buffer.from('video-key') }
    }
  }
);
assert.equal(viewOnce.getViewOnceMedia({ imageMessage: { viewOnce: false } }), null);

async function testDownloadUsesReuploadCallback() {
  const targetMessage = { key: { id: 'quoted-id' }, message: { imageMessage: image.imageMessage } };
  const updateMediaMessage = async () => {};
  let downloadArguments;
  const buffer = await viewOnce.downloadViewOnceMedia(
    { updateMediaMessage },
    targetMessage,
    async (...args) => {
      downloadArguments = args;
      return Buffer.from('media');
    }
  );
  assert.equal(buffer.toString(), 'media');
  assert.equal(downloadArguments[0], targetMessage);
  assert.equal(downloadArguments[1], 'buffer');
  assert.equal(downloadArguments[3].reuploadRequest, updateMediaMessage);
}

async function testQuotedTargetPrefersCachedOriginal() {
  const cachedMessage = {
    key: { remoteJid: 'chat@g.us', id: 'quoted-id', participant: 'sender@s.whatsapp.net' },
    message: { viewOnceMessageV2: { message: image } }
  };
  const contextInfo = {
    stanzaId: 'quoted-id',
    participant: 'sender@s.whatsapp.net',
    quotedMessage: { imageMessage: { viewOnce: true } }
  };

  messageStore.messages.clear();
  messageStore.add(cachedMessage);
  assert.equal(
    await viewOnce.getQuotedTargetMessage('chat@g.us', contextInfo),
    cachedMessage
  );
  assert.deepEqual(
    viewOnce.getViewOnceMedia(
      (await viewOnce.getQuotedTargetMessage('chat@g.us', contextInfo)).message
    ),
    { messageType: 'imageMessage', message: image }
  );

  messageStore.messages.clear();
  const fallback = await viewOnce.getQuotedTargetMessage('chat@g.us', contextInfo);
  assert.equal(fallback.key.id, 'quoted-id');
  assert.equal(fallback.key.participant, 'sender@s.whatsapp.net');
  assert.equal(fallback.message, contextInfo.quotedMessage);
}

Promise.all([testDownloadUsesReuploadCallback(), testQuotedTargetPrefersCachedOriginal()])
  .then(() => console.log('View-once parsing, cached-message recovery, and alias tests passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
