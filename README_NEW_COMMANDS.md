# New Commands Added to Poltergeist-Bot

This folder contains 13 new commands that were added to the bot from the "new commands" directory. Each command follows the existing codebase format and includes an emoji system for visual feedback.

## Commands Created

### Utility Commands
1. **base64.js** - Encode text to Base64
   - Working emoji: 🔡
   - Done emoji: 🔗

### AI Commands
2. **gpt.js** - Ask AI questions (GPT/Llama/Mistral)
   - Working emoji: 🤖
   - Done emoji: Included in response

3. **llama.js** - Llama AI queries
   - Working emoji: 🦙

4. **mistral.js** - Mistral AI queries
   - Working emoji: 🪄

### Downloader Commands
5. **alamy.js** - Download from Alamy URL
   - Category: downloaders

6. **android1.js** - APK search and download

### Owner Commands
7. **addreply.js** - Add auto-reply trigger
   - Working emoji: ➕
   - Done emoji: ✅

8. **antidelete.js** - Enable/disable antidelete feature

9. **cmdreact.js** - Toggle command reactions

10. **areact.js** - Auto-react to messages with emojis

### Fun Commands
11. **audiofx.js** - Apply audio effects (bass, nightcore, chipmunk, etc.)
    - Working emoji: 🎧

### Stickers Commands
12. **attp.js** - Generate animated sticker from text

### Images Commands
13. **coding.js** - Get random programming images

## Emoji System

Each command now includes:

### Working Emoji (shown when command starts)
- 🔡 - Base64 encoding
- 🤖 - AI commands
- ➕ - Add reply
- 🎧 - Audio effects
- 🦙 - Llama AI
- 🪄 - Mistral AI

### Done Emoji (included in response)
- 🔗 - Base64 results
- ✅ - Successful operations
- ❌ - Errors
- And command-specific indicators

**Implementation pattern in command handlers:**
```javascript
// Show working emoji at start
await sock.sendMessage(chatId, { react: { text: 'emoji', key: message.key } });

// ... command processing ...

// Include done emoji in response text
await sock.sendMessage(chatId, { text: `*🔗 Result:*...`, ... });
```