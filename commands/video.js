const axios = require('axios');
const yts = require('yt-search');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, text/plain, */*' }
};

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try { return await getter(); }
        catch (err) {
            lastError = err;
            if (attempt < attempts) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    throw lastError;
}

async function getEliteProTechVideo(url) {
    const res = await tryRequest(() => axios.get(`https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(url)}&format=mp4`, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.downloadURL) return { download: res.data.downloadURL, title: res.data.title };
    throw new Error('EliteProTech failed');
}

async function getYupraVideo(url) {
    const res = await tryRequest(() => axios.get(`https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(url)}`, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) return { download: res.data.data.download_url, title: res.data.data.title };
    throw new Error('Yupra failed');
}

module.exports = {
    pattern: "video",
    alias: ["vid"],
    desc: "Download video from YouTube",
    react: "🎥",
    category: "media",
    use: ".video <name or YouTube link>",
    filename: __filename,

    execute: async (conn, mek, m, { from, q, reply }) => {
        if (!q) return reply("❌ Please provide a video name or YouTube link.\n📌 *Usage:* `.video <name or link>`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");

        try {
            for (const emoji of ['📥', '⏳', '🎥']) {
                await conn.sendMessage(from, { react: { text: emoji, key: mek.key } });
            }

            let videoUrl = '', videoTitle = '', videoThumbnail = '';

            if (q.includes('youtube.com') || q.includes('youtu.be')) {
                videoUrl = q; videoTitle = 'YouTube Video';
            } else {
                const { videos } = await yts(q);
                if (!videos?.length) return reply('❌ No videos found! Try a different name.');
                videoUrl = videos[0].url;
                videoTitle = videos[0].title;
                videoThumbnail = videos[0].thumbnail;
            }

            await conn.sendMessage(from, {
                image: { url: videoThumbnail || 'https://i.imgur.com/2wzGhpF.jpeg' },
                caption: `🎥 *Downloading:* ${videoTitle}`
            }, { quoted: mek });

            let videoData, downloadSuccess = false;
            const apis = [
                { name: 'EliteProTech', fn: () => getEliteProTechVideo(videoUrl) },
                { name: 'Yupra', fn: () => getYupraVideo(videoUrl) }
            ];

            for (const api of apis) {
                try {
                    videoData = await api.fn();
                    if (videoData?.download) { downloadSuccess = true; break; }
                } catch (err) { console.log(`${api.name} failed:`, err.message); }
            }

            if (!downloadSuccess) throw new Error('All download sources failed.');

            await conn.sendMessage(from, {
                video: { url: videoData.download },
                mimetype: 'video/mp4',
                fileName: `${(videoData.title || videoTitle).replace(/[^\w\s-]/g, '')}.mp4`,
                caption: `*${videoData.title || videoTitle}*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            }, { quoted: mek });

            await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

        } catch (error) {
            console.error('Video error:', error);
            await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
            await reply(`❌ Error: ${error.message}`);
        }
    }
};
