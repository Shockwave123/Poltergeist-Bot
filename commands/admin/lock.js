/**
 * Lock Command - Lock/unlock group settings (only admins can edit info)
 * Usage: .lock <on/off>  |  .unlock (alias, locks off)
 */

module.exports = {
  name: 'lock',
  aliases: ['unlock'],
  category: 'admin',
  description: 'Lock or unlock group settings (only admins can edit group info)',
  usage: '.lock on | .lock off\n.unlock = .lock off',
  groupOnly: true,
  adminOnly: true,
  botAdminNeeded: true,

  async execute(sock, msg, args, extra) {
    try {
      // Distinguish .lock vs .unlock via the invoked name (handler passes commandName)
      const invoked = (extra.commandName || '').toLowerCase();
      const arg = (args[0] || '').toLowerCase();

      let mode;
      if (invoked === 'unlock') mode = 'unlocked';
      else if (arg === 'off' || arg === 'unlock') mode = 'unlocked';
      else mode = 'locked';

      const currentlyLocked = extra.groupMetadata?.restrict === true;
      if ((mode === 'locked' && currentlyLocked) || (mode === 'unlocked' && !currentlyLocked)) {
        return extra.reply(
          mode === 'locked'
            ? '🔒 Group settings are already *locked* (admins only).'
            : '🔓 Group settings are already *unlocked* (everyone can edit).'
        );
      }

      await sock.groupSettingUpdate(extra.from, mode);

      return extra.reply(
        mode === 'locked'
          ? '🔒 *Group locked*\nOnly admins can edit group settings now.'
          : '🔓 *Group unlocked*\nAll members can edit group settings again.'
      );
    } catch (error) {
      console.error('[lock] error:', error);
      await extra.reply('❌ Error: ' + error.message);
    }
  }
};
