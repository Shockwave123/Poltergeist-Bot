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
assert.ok(viewOnce.aliases.includes('view'));
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
    ephemeralMessage: {
      message: {
        viewOnceMessageV2: {
          message: {
            documentMessage: { viewOnce: true, mediaKey: Buffer.from('document-key') }
          }
        }
      }
    }
  }),
  {
    messageType: 'documentMessage',
    message: {
      documentMessage: { viewOnce: true, mediaKey: Buffer.from('document-key') }
    }
  }
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

// Test new detection logic: viewOnce flag as number (1)
assert.deepEqual(
  viewOnce.getViewOnceMedia({
    imageMessage: { viewOnce: 1, mediaKey: Buffer.from('media-key') }
  }),
  { messageType: 'imageMessage', message: { imageMessage: { viewOnce: 1, mediaKey: Buffer.from('media-key') } } }
);

// Test detection from viewOnceMessage container without explicit viewOnce flag
assert.deepEqual(
  viewOnce.getViewOnceMedia({
    viewOnceMessage: {
      message: {
        imageMessage: { mediaKey: Buffer.from('media-key') }
      }
    }
  }),
  { messageType: 'imageMessage', message: { imageMessage: { mediaKey: Buffer.from('media-key') } } }
);

// Test stickerMessage detection
assert.deepEqual(
  viewOnce.getViewOnceMedia({
    stickerMessage: { viewOnce: true, mediaKey: Buffer.from('sticker-key') }
  }),
  { messageType: 'stickerMessage', message: { stickerMessage: { viewOnce: true, mediaKey: Buffer.from('sticker-key') } } }
);

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

async function testCachedQuotedTargetWithoutEmbeddedQuote() {
  const cachedMessage = {
    key: { remoteJid: 'cached-chat@g.us', id: 'cached-view-once-id' },
    message: { imageMessage: { viewOnce: true, mediaKey: Buffer.from('cached-key') } }
  };
  messageStore.add(cachedMessage);
  const contextInfo = { stanzaId: 'cached-view-once-id' };

  assert.equal(
    await viewOnce.getQuotedTargetMessage('cached-chat@g.us', contextInfo),
    cachedMessage
  );
  assert.deepEqual(
    viewOnce.getViewOnceMedia(
      (await viewOnce.getQuotedTargetMessage('cached-chat@g.us', contextInfo)).message
    ),
    { messageType: 'imageMessage', message: cachedMessage.message }
  );

  const cachedOrdinaryMessage = {
    key: { remoteJid: 'cached-chat@g.us', id: 'cached-ordinary-id' },
    message: { conversation: 'ordinary message' }
  };
  messageStore.add(cachedOrdinaryMessage);
  const sent = [];
  await viewOnce.execute({
    sendMessage: async (...args) => sent.push(args)
  }, {
    key: { remoteJid: 'cached-chat@g.us', id: 'command-id' },
    message: {
      extendedTextMessage: {
        contextInfo: { stanzaId: 'cached-ordinary-id' }
      }
    }
  }, []);
  assert.equal(sent[0][1].text, '❌ This is not a view-once message!');
}

Promise.all([
  testDownloadUsesReuploadCallback(),
  testQuotedTargetPrefersCachedOriginal(),
  testCachedQuotedTargetWithoutEmbeddedQuote()
])
  .then(() => console.log('View-once parsing, cached-message recovery, and alias tests passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
