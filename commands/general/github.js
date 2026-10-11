const axios = require('axios');
const config = require('../../config');

function getRepositoryCoordinates(value) {
    try {
        const url = new URL(value);
        if (url.hostname.toLowerCase() !== 'github.com') return null;
        const [owner, repository] = url.pathname.split('/').filter(Boolean);
        if (!owner || !repository || /yourusername|yourrepository/i.test(`${owner}/${repository}`)) return null;
        return { owner, repository: repository.replace(/\.git$/i, '') };
    } catch (error) {
        return null;
    }
}

module.exports = {
    name: 'github',
    aliases: ['repo', 'git', 'source', 'sc', 'script'],
    category: 'general',
    description: 'Show the configured GitHub repository and public statistics',
    usage: '.repo',

    async execute(sock, msg, args, extra) {
        const repoUrl = process.env.GITHUB_REPO_URL || config.social?.github || '';
        const coordinates = getRepositoryCoordinates(repoUrl);
        if (!coordinates) {
            return extra.reply('Repository link is not configured. Set `GITHUB_REPO_URL` in Render to a public GitHub repository URL.');
        }

        try {
            const apiUrl = `https://api.github.com/repos/${encodeURIComponent(coordinates.owner)}/${encodeURIComponent(coordinates.repository)}`;
            const response = await axios.get(apiUrl, {
                timeout: 10000,
                headers: { 'User-Agent': 'PoltergeistMD', accept: 'application/vnd.github+json' }
            });
            const repo = response.data;
            return extra.reply([
                `📦 *${repo.full_name}*`,
                repo.description || 'No description provided.',
                `⭐ ${repo.stargazers_count.toLocaleString()} stars  ·  🍴 ${repo.forks_count.toLocaleString()} forks`,
                repo.html_url
            ].join('\n'));
        } catch (error) {
            const reason = error.response?.status === 404 ? 'repository not found or private' : error.message;
            return extra.reply(`Could not load repository details: ${reason}`);
        }
    }
};