/**
 * AFK Command — Away From Keyboard (owner offline mode)
 * When ON, bot replies once per user when tagged or replied to.
 */

const afk = require('../../utils/afk');

module.exports = {
  name: 'afk',
  aliases: ['away'],
  category: 'owner',
  description: 'Enable/disable AFK mode (owner offline auto-reply)',
  usage: '.afk <on/off> [custom message]',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const opt = (args[0] || '').toLowerCase();

      if (!opt) {
        const on = afk.isEnabled();
        return extra.reply(
          `🔴 *AFK Mode*\n\n` +
          `Status: *${on ? 'ON' : 'OFF'}*\n\n` +
          `Voice replies: *${afk.isVoiceEnabled() ? 'ON' : 'OFF'}*\n` +
          `Groups: *${afk.isScopeEnabled(true) ? 'ON' : 'OFF'}* | DMs: *${afk.isScopeEnabled(false) ? 'ON' : 'OFF'}*\n\n` +
          `When ON:\n` +
          `• *Groups* — one-time reply when someone @tags or replies to the bot\n` +
          `• *DMs* — one-time reply to any message\n` +
          `Repeated messages from the same person are ignored to avoid spam.\n\n` +
          `Usage:\n` +
          `  .afk on\n` +
          `  .afk on voice busy right now\n` +
          `  .afk voice on\n` +
          `  .afk voice off\n` +
          `  .afk group on | .afk group off\n` +
          `  .afk dm on | .afk dm off\n` +
          `  .afk phrase I am away right now\n` +
          `  .afk off`
        );
      }

      if (opt === 'on') {
        if (afk.isEnabled()) {
          return extra.reply('*AFK is already ON*');
        }
        const voice = (args[1] || '').toLowerCase() === 'voice';
        const customMsg = args.slice(voice ? 2 : 1).join(' ').trim();
        const message = customMsg
          ? `🔴 *AFK Mode ON*\n\n${customMsg}`
          : afk.DEFAULT_MESSAGE;
        afk.setEnabled(true, message);
        afk.setVoiceEnabled(voice);
        return extra.reply(`*AFK mode enabled.* ${voice ? 'Voice' : 'Text'} replies will notify taggers/repliers once each.`);
      }

      if (opt === 'voice') {
        const voiceOption = (args[1] || '').toLowerCase();
        if (!['on', 'off'].includes(voiceOption)) {
          return extra.reply('❌ Use: .afk voice on | .afk voice off');
        }
        afk.setVoiceEnabled(voiceOption === 'on');
        return extra.reply(`*AFK voice replies ${voiceOption === 'on' ? 'enabled' : 'disabled'}.*`);
      }

      if (opt === 'group' || opt === 'groups' || opt === 'dm' || opt === 'dms') {
        const scopeOption = (args[1] || '').toLowerCase();
        if (!['on', 'off'].includes(scopeOption)) {
          return extra.reply(`❌ Use: .afk ${opt} on | .afk ${opt} off`);
        }
        const scope = opt.startsWith('g') ? 'groups' : 'dms';
        afk.setScope(scope, scopeOption === 'on');
        return extra.reply(`*AFK ${scope} replies ${scopeOption === 'on' ? 'enabled' : 'disabled'}.*`);
      }

      if (opt === 'phrase' || opt === 'message') {
        const phrase = args.slice(1).join(' ').trim();
        if (!phrase) return extra.reply('❌ Add the phrase after `.afk phrase`.');
        afk.setMessage(phrase);
        return extra.reply('*AFK reply phrase updated.*');
      }

      if (opt === 'off') {
        if (!afk.isEnabled()) {
          return extra.reply('*AFK is already OFF*');
        }
        afk.setEnabled(false);
        afk.setVoiceEnabled(false);
        return extra.reply('*AFK mode disabled.* You are back online.');
      }

      return extra.reply('❌ Invalid option. Use: .afk on | .afk off');
    } catch (err) {
      console.error('[afk cmd] error:', err);
      return extra.reply('❌ Error updating AFK mode.');
    }
  },
};
