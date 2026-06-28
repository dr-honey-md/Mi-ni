const axios = require('axios');

module.exports = {
    pattern: "meme",
    desc: "Get a random meme",
    react: "🎭",
    category: "fun",
    use: ".meme",
    filename: __filename,

    execute: async (conn, mek, m, { from, reply }) => {
        try {
            await conn.sendMessage(from, { react: { text: '🎭', key: mek.key } });

            const response = await axios.get('https://meme-api.com/gimme', { timeout: 10000 });
            const data = response.data;

            if (!data || !data.url) throw new Error("No meme found");

            await conn.sendMessage(from, {
                image: { url: data.url },
                caption: `╭━━━〔 🎭 *RANDOM MEME* 〕━━━┈⊷\n┃ 📝 ${data.title || 'Meme'}\n┃ 👍 ${data.ups || 0} upvotes\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            }, { quoted: mek });

        } catch (error) {
            console.error('Meme error:', error);
            await reply('❌ Failed to fetch meme. Please try again later.');
        }
    }
};
