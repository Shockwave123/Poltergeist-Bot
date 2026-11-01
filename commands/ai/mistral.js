import axios from 'axios';
const MISTRAL_API = (q) => `https://mistral.gtech-apiz.workers.dev/?apikey=Suhail&text=${encodeURIComponent(q)}`;
const askMistral = async (query) => {
    try {
        const { data } = await axios.get(MISTRAL_API(query), { timeout: 15000 });
        const response = data?.data?.response;
        if (response && typeof response === 'string' && response.trim()) {
            return response.trim();
        }
    }
    catch {
        // ignored
    }
    throw new Error('Mistral API failed');
};
export default {
    command: 'mistral',
    aliases: ['mistral-ai'],
    category: 'ai',
    description: 'Ask a question using Mistral AI',
    usage: '.mistral <question>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(chatId, { text: '🤖 *Mistral AI*\n\nUsage: `.mistral <your question>`' }, { quoted: message });
        }
        try {
            await sock.sendMessage(chatId, { react: { text: '🪄', key: message.key } });
            const answer = await askMistral(query);
            await sock.sendMessage(chatId, { text: answer }, { quoted: message });
        }
        catch (error) {
            console.error('Mistral Command Error:', error.message);
            await sock.sendMessage(chatId, { text: '❌ Failed to get Mistral response. Please try again later.' }, { quoted: message });
        }
    }
};