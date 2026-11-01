import axios from 'axios';
const LLAMA_API = (q) => `https://llama.gtech-apiz.workers.dev/?apikey=Suhail&text=${encodeURIComponent(q)}`;
const askLlama = async (query) => {
    try {
        const { data } = await axios.get(LLAMA_API(query), { timeout: 15000 });
        const response = data?.data?.response;
        if (response && typeof response === 'string' && response.trim()) {
            return response.trim();
        }
    }
    catch {
        // ignored
    }
    throw new Error('Llama API failed');
};
export default {
    command: 'llama',
    aliases: ['llama-ai', 'llm'],
    category: 'ai',
    description: 'Ask a question using Llama AI',
    usage: '.llama <question>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(chatId, { text: '🦙 *Llama AI*\n\nUsage: `.llama <your question>`' }, { quoted: message });
        }
        try {
            await sock.sendMessage(chatId, { react: { text: '🦙', key: message.key } });
            const answer = await askLlama(query);
            await sock.sendMessage(chatId, { text: answer }, { quoted: message });
        }
        catch (error) {
            console.error('Llama Command Error:', error.message);
            await sock.sendMessage(chatId, { text: '❌ Failed to get Llama response. Please try again later.' }, { quoted: message });
        }
    }
};