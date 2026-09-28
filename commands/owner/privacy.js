/**
 * Privacy Command - View and change the linked account's privacy settings
 * (owner only, since these settings affect the whole account)
 */

const config = require('../../config');

const CHOICES = {
  lastseen: {
    method: 'updateLastSeenPrivacy',
    values: ['all', 'contacts', 'contact_blacklist', 'none'],
    label: 'Last seen'
  },
  online: {
    method: 'updateOnlinePrivacy',
    values: ['all', 'match_last_seen'],
    label: 'Online status'
  },
  profile: {
    method: 'updateProfilePicturePrivacy',
    values: ['all', 'contacts', 'contact_blacklist', 'none'],
    label: 'Profile photo'
  },
  status: {
    method: 'updateStatusPrivacy',
    values: ['all', 'contacts', 'contact_blacklist', 'none'],
    label: 'Status updates'
  },
  readreceipts: {
    method: 'updateReadReceiptsPrivacy',
    values: ['all', 'none'],
    label: 'Read receipts'
  },
  groupadd: {
    method: 'updateGroupsAddPrivacy',
    values: ['all', 'contacts', 'contact_blacklist'],
    label: 'Who can add me to groups'
  }
};

// The server response key differs slightly between WA Web builds
const SETTING_KEYS = {
  lastseen: ['last', 'lastSeen', 'lastseen'],
  online: ['online'],
  profile: ['profile', 'profilePicture'],
  status: ['status'],
  readreceipts: ['readreceipts', 'readReceipts'],
  groupadd: ['groupadd', 'groupsAdd']
};

const readSetting = (settings, action) => {
  if (!settings) return 'unknown';
  for (const key of SETTING_KEYS[action] || []) {
    if (settings[key] !== undefined && settings[key] !== null) return String(settings[key]);
  }
  return 'unknown';
};

module.exports = {
  name: 'privacy',
  aliases: ['privacysettings', 'mysettings', 'accountprivacy'],
  category: 'owner',
  description: 'View or change WhatsApp privacy settings (owner only)',
  usage: '.privacy | .privacy lastseen all | .privacy readreceipts none | .privacy groupadd contacts',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = extra.prefix || '.';
    const action = (args[0] || '').toLowerCase();
    const value = (args[1] || '').toLowerCase();

    try {
      if (!action || !CHOICES[action]) {
        const raw = typeof sock.fetchPrivacySettings === 'function'
          ? await sock.fetchPrivacySettings().catch(() => null)
          : null;

        const lines = [
          '╭───『 🔒 *PRIVACY SETTINGS* 』───',
          '│'
        ];

        Object.keys(CHOICES).forEach((key) => {
          lines.push(`│ • *${CHOICES[key].label}:* ${readSetting(raw, key)}`);
        });
        lines.push('│');

        if (!action) {
          lines.push('├─『 ⚙️ *HOW TO CHANGE* 』──');
          Object.keys(CHOICES).forEach((key) => {
            lines.push(`│ • ${key}: ${CHOICES[key].values.join(' | ')}`);
          });
          lines.push('│');
          lines.push(`│ Example: \`${prefix}privacy lastseen contacts\``);
          lines.push(`│ Example: \`${prefix}privacy readreceipts none\``);
          lines.push('│');
          lines.push('│ ℹ️ Values follow WhatsApp Web: all, contacts, contact_blacklist, none.');
          lines.push('╰─────────────────────────────');
          return extra.reply(lines.join('\n'));
        }

        lines.push(`│ ℹ️ Unknown setting *${action}*.`);
        lines.push('╰─────────────────────────────');
        return extra.reply(lines.join('\n'));
      }

      const target = CHOICES[action];
      if (!value) {
        return extra.reply(
          `ℹ️ *${target.label}* accepts: ${target.values.join(' | ')}\n\n` +
          `Example: \`${prefix}privacy ${action} ${target.values[0]}\``
        );
      }

      if (!target.values.includes(value)) {
        return extra.reply(`❌ *${value}* is not valid for ${target.label}.\n\nAllowed: ${target.values.join(' | ')}`);
      }

      if (typeof sock[target.method] !== 'function') {
        return extra.reply('❌ This Baileys version cannot change that privacy setting.');
      }

      await sock[target.method](value);

      return extra.reply(`✅ *${target.label}* is now set to *${value}*.`);
    } catch (error) {
      console.error('[privacy] failed:', error);
      return extra.reply(`❌ Could not update privacy settings: ${error.message}`);
    }
  }
};
