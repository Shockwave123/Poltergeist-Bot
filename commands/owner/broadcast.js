/**
 * Broadcast Command - Send message to all chats
 */

module.exports = {
    name: 'broadcast',
    aliases: ['bc'],
    category: 'owner',
    description: 'Broadcast message to all chats (supports replying to a message)',
    usage: '.broadcast <message>  |  Reply to a message with .broadcast',
    ownerOnly: true,
    
    async execute(sock, msg, args, extra) {
      try {
        let message = '';
        if (args.length > 0) {
          message = args.join(' ');
        } else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
          const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;
          message = quoted.conversation || quoted.extendedTextMessage?.text || quoted.caption || '';
        }
        if (!message) {
          return extra.reply('❌ Usage: .broadcast <message>\nReply to a message with .broadcast to broadcast it\n\nExample: .broadcast Hello everyone!');
        }
        
        
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats);
        
        let success = 0;
        let failed = 0;
        
        for (const group of groups) {
          try {
            await sock.sendMessage(group.id, {
              text: `📢 *BROADCAST MESSAGE*\n\n${message}\n\n_This is a broadcast message from bot owner_`
            });
            success++;
          } catch (e) {
            failed++;
          }
        }
        
        await extra.reply(`✅ Broadcast complete!\n\n✅ Success: ${success}\n❌ Failed: ${failed}`);
        
      } catch (error) {
        await extra.reply(`❌ Error: ${error.message}`);
      }
    }
  };
  

