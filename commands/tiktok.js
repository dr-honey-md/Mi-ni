const axios = require('axios');

module.exports = {
    pattern: "tiktok",
    alias: ["tt"],
    desc: "Download TikTok video without watermark",
    react: "📱",
    category: "download",
    use: ".tiktok <tiktok url>",
    filename: __filename,

    execute: async (conn, mek, m, { from, q, reply }) => {
        if (!q) return reply("❌ Please provide a TikTok URL.\n\n📌 *Usage:* `.tiktok <url>`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");

        try {
            for (const emoji of ['📥', '⏳', '📱']) {
                await conn.sendMessage(from, { react: { text: emoji, key: mek.key } });
            }

            const res = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(q)}`);
            const data = res.data?.data;
            if (!data?.play) throw new Error("No video found");

            await conn.sendMessage(from, {
                video: { url: data.play },
                caption: `╭━━━〔 📱 *TIKTOK DL* 〕━━━┈⊷\n┃ ✅ Video Downloaded!\n┃ 👤 @${data.author?.unique_id || 'unknown'}\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            }, { quoted: mek });

            await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

        } catch (e) {
            console.error('TikTok error:', e.message);
            await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
            await reply("❌ Error downloading TikTok. Make sure the link is valid.");
        }
    }
};
