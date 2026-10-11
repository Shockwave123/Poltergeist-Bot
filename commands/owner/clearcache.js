/**
 * ClearCache Command - Force a garbage-collection pass and clear in-memory caches
 * (owner only — exposes RAM internals and clears shared state)
 */

module.exports = {
  name: 'clearcache',
  aliases: ['gc', 'freemem', 'clearmem'],
  category: 'owner',
  description: 'Force a GC pass and clear in-memory caches to reclaim RAM (owner only)',
  usage: '.clearcache',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      await extra.react('⏳');

      const before = process.memoryUsage();
      const beforeMb = Math.round(before.rss / (1024 * 1024));

      // 1) Clear the group-metadata cache in handler
      try {
        const handler = require('../../handler');
        if (typeof handler.clearCaches === 'function') handler.clearCaches();
      } catch (e) { /* handler may not export clearCaches */ }

      // 2) Clear the in-process store (message store in index.js)
      try {
        const index = require('../../index');
        if (index.store?.messages) index.store.messages.clear();
      } catch (e) { /* ignore */ }

      // 3) Clean up old temp files
      try {
        const { cleanupOldFiles } = require('../../utils/cleanup');
        cleanupOldFiles();
      } catch (e) { /* ignore */ }

      // 4) Force a full GC if Node was started with --expose-gc
      let gcRan = false;
      if (typeof global.gc === 'function') {
        global.gc();
        gcRan = true;
      }

      // Give GC a moment to settle
      await new Promise((resolve) => setTimeout(resolve, 600));

      const after = process.memoryUsage();
      const afterMb = Math.round(after.rss / (1024 * 1024));
      const freedMb = beforeMb - afterMb;
      const heapMb = Math.round(after.heapUsed / (1024 * 1024));

      const ramBar = (() => {
        const pct = Math.min(afterMb / 460, 1);
        const filled = Math.round(pct * 10);
        return '█'.repeat(filled) + '░'.repeat(10 - filled);
      })();

      const lines = [
        '╭───『 🧹 *CACHE CLEARED* 』───',
        `│ ♻️ GC ran: ${gcRan ? '✅ yes' : '⚠️ no (start with --expose-gc)'}`,
        `│ 💾 RAM before: ${beforeMb} MB`,
        `│ 💾 RAM after:  ${afterMb} MB  [${ramBar}]`,
        `│ 📉 Freed:      ${freedMb > 0 ? `~${freedMb} MB` : '< 1 MB (already lean)'}`,
        `│ 🧠 Heap used:  ${heapMb} MB`,
        '╰──────────────────────────────',
      ];

      await extra.react('✅');
      return extra.reply(lines.join('\n'));
    } catch (error) {
      console.error('[clearcache] failed:', error);
      await extra.react('❌');
      return extra.reply(`❌ Could not clear caches: ${error.message}`);
    }
  },
};
