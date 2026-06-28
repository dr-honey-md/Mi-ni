const axios = require('axios');

module.exports = {
    pattern: "insta",
    alias: ["ig", "instagram"],
    desc: "Download Instagram photo/video",
    react: "📸",
    category: "download",
    use: ".insta <instagram url>",
    filename: __filename,

    execute: async (conn, mek, m, { from, q, reply }) => {
        if (!q) return reply("❌ Please provide an Instagram URL.\n\n📌 *Usage:* `.insta <url>`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");

        try {
            await conn.sendMessage(from, { react: { text: '📥', key: mek.key } });
            await reply("⏳ *Downloading Instagram content...*");

            const res = await axios.get(`https://api.vreden.my.id/api/igdownload?url=${encodeURIComponent(q)}`);
            if (res.data.status && res.data.result && res.data.result.length > 0) {
                for (let item of res.data.result) {
                    if (item.type === 'video') {
                        await conn.sendMessage(from, {
                            video: { url: item.url },
                            caption: "✅ *Instagram Video Downloaded*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀"
                        }, { quoted: mek });
                    } else {
                        await conn.sendMessage(from, {
                            image: { url: item.url },
                            caption: "✅ *Instagram Image Downloaded*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀"
                        }, { quoted: mek });
                    }
                }
                await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });
            } else {
                throw new Error("No media found");
            }
        } catch (e) {
            console.error('Instagram DL Error:', e.message);
            await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
            await reply("❌ Error downloading. Make sure the link is public.");
        }
    }
};
