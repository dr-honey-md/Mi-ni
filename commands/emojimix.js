const axios = require('axios');

module.exports = {
    pattern: "emojimix",
    desc: "Mix two emojis together",
    react: "🎴",
    category: "fun",
    use: ".emojimix 😎+🥰",
    filename: __filename,

    execute: async (conn, mek, m, { from, q, reply }) => {
        if (!q) return reply('🎴 *Usage:* `.emojimix 😎+🥰`\n\nSeparate emojis with a *+* sign\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀');
        if (!q.includes('+')) return reply('✳️ Separate the emojis with a *+* sign\n\n📌 *Example:* `.emojimix 😎+🥰`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀');

        try {
            await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } });

            let [emoji1, emoji2] = q.split('+').map(e => e.trim());
            const url = `https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`;

            const res = await axios.get(url);
            const results = res.data?.results;

            if (!results || results.length === 0) {
                return reply('❌ No mix found for these emojis. Try different ones!\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀');
            }

            const imgUrl = results[0]?.media_formats?.png_transparent?.url || results[0]?.media_formats?.gif?.url;
            if (!imgUrl) return reply('❌ Could not get image for this emoji mix.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀');

            const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(imgRes.data);

            await conn.sendMessage(from, {
                sticker: buffer
            }, { quoted: mek });

            await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

        } catch (e) {
            console.error('Emojimix error:', e.message);
            await reply('❌ Error mixing emojis. Try a different combination!');
        }
    }
};
