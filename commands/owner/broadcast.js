module.exports = {
  name: 'broadcast',
  aliases: ['bc'],
  category: 'owner',
  description: 'Disabled to prevent unsolicited cross-group bulk messaging',
  usage: '.broadcast (cross-group broadcast is disabled)',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    return extra.reply(
      '🚫 Cross-group broadcasting is disabled to prevent unsolicited bulk messages. ' +
      'Send announcements only in groups that have requested them.'
    );
  }
};
