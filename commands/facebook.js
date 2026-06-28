const axios = require('axios');

module.exports = {
    pattern: "fb",
    alias: ["facebook"],
    desc: "Download Facebook video",
    react: "📘",
    category: "download",
    use: ".fb <facebook video url>",
    filename: __filename,

    execute: async (conn, mek, m, { from, q, reply }) => {
        if (!q) return reply("📘 *Usage:* `.fb <Facebook video URL>`\n\n📌 Example: `.fb https://www.facebook.com/...`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        if (!q.includes('facebook.com') && !q.includes('fb.com') && !q.includes('fb.watch')) {
            return reply("❌ That is not a valid Facebook link.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        }

        try {
            await conn.sendMessage(from, { react: { text: '🔄', key: mek.key } });
            await reply("⏳ *Downloading Facebook video...*");

            const apiRes = await axios.get(`https://api.vreden.my.id/api/fbdl?url=${encodeURIComponent(q)}`);
            const data = apiRes.data;

            if (!data || !data.result) throw new Error("No video found");

            const videoUrl = data.result.high || data.result.low;
            if (!videoUrl) throw new Error("No download URL found");

            await conn.sendMessage(from, {
                video: { url: videoUrl },
                caption: `╭━━━〔 📘 *FACEBOOK DL* 〕━━━┈⊷\n┃ ✅ *Video Downloaded!*\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            }, { quoted: mek });

            await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

        } catch (e) {
            console.error('Facebook DL Error:', e.message);
            await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
            await reply('❌ Failed to download Facebook video. Make sure link is public and valid.');
        }
    }
};
