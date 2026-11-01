import fs from 'fs';
import path from 'path';
import { dataFile } from '../lib/paths.js';
import { writeFile } from 'fs/promises';
import store from '../lib/lightweight_store.js';
const messageStore = new Map();
const CONFIG_PATH = dataFile('antidelete.json');
const TEMP_MEDIA_DIR = path.join(process.cwd(), 'temp');
const MONGO_URL = process.env.MONGO_URL;
const POSTGRES_URL = process.env.POSTGRES_URL;
const MYSQL_URL = process.env.MYSQL_URL;
const SQLITE_URL = process.env.DB_URL;
const HAS_DB = !!(MONGO_URL || POSTGRES_URL || MYSQL_URL || SQLITE_URL);
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}
const getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }
        return totalSize / (1024 * 1024);
    }
    catch (err) {
        console.error('Error getting folder size:', err);
        return 0;
    }
};
const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
        if (sizeMB > 200) {
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                const filePath = path.join(TEMP_MEDIA_DIR, file);
                fs.unlinkSync(filePath);
            }
        }
    }
    catch (err) {
        console.error('Temp cleanup error:', err);
    }
};
setInterval(cleanTempFolderIfLarge, 60 * 1000);
async function loadAntideleteConfig() {
    try {
        if (HAS_DB) {
            const config = await store.getSetting('global', 'antidelete');
            return config || { enabled: false };
        }
        else {
            if (!fs.existsSync(CONFIG_PATH))
                return { enabled: false };
            return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
        }
    }
    catch {
        return { enabled: false };
    }
}
async function saveAntideleteConfig(config) {
    try {
        if (HAS_DB) {
            await store.saveSetting('global', 'antidelete', config);
        }
        else {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        }
    }
    catch (err) {
        console.error('Config save error:', err);
    }
}
export default {
    command: 'antidelete',
    aliases: ['antidel', 'adel'],
    category: 'owner',
    description: 'Enable or disable antidelete feature to track deleted messages',
    usage: '.antidelete <on|off>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const config = await loadAntideleteConfig();
        const action = args[0]?.toLowerCase();
        if (!action) {
            await sock.sendMessage(chatId, {
                text: `*🔰 ANTIDELETE SETUP 🔰*\n\n`
                    + `*Current Status:* ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n`
                    + `*Storage:* ${HAS_DB ? 'Database' : 'File System'}\n\n`
                    + `*Commands:*\n`
                    + `• .antidelete on - Enable\n`
                    + `• .antidelete off - Disable\n\n`
                    + `*Features:*\n`
                    + `• Track deleted messages\n`
                    + `• Save deleted media\n`
                    + `• Auto-save ViewOnce media\n`
                    + `• Send reports to owner`
            }, { quoted: message });
            return;
        }
        if (action === 'on') {
            config.enabled = true;
            await saveAntideleteConfig(config);
            await sock.sendMessage(chatId, {
                text: `✅ *Antidelete enabled!*\n\n`
                    + `Storage: ${HAS_DB ? 'Database' : 'File System'}\n\n`
                    + `The bot will now:\n`
                    + `• Track all messages\n`
                    + `• Monitor deleted messages\n`
                    + `• Save ViewOnce media\n`
                    + `• Send deletion reports to owner`
            }, { quoted: message });
        }
        else if (action === 'off') {
            config.enabled = false;
            await saveAntideleteConfig(config);
            await sock.sendMessage(chatId, {
                text: `❌ *Antidelete disabled!*\n\n`
                    + `The bot will no longer track deleted messages.`
            }, { quoted: message });
        }
        else {
            await sock.sendMessage(chatId, {
                text: '❌ *Invalid command*\n\nUse: `.antidelete on/off`'
            }, { quoted: message });
        }
    }
};