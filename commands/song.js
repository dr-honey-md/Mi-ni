const axios = require('axios');
const yts = require('yt-search');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json, text/plain, */*'
    }
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

async function getEliteProTechDownload(url) {
    const res = await tryRequest(() => axios.get(`https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(url)}&format=mp3`, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.downloadURL) return { download: res.data.downloadURL, title: res.data.title };
    throw new Error('EliteProTech failed');
}

async function getYupraDownload(url) {
    const res = await tryRequest(() => axios.get(`https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(url)}`, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) return { download: res.data.data.download_url, title: res.data.data.title };
    throw new Error('Yupra failed');
}

async function getVredenDownload(url) {
    const res = await axios.get(`https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(url)}`, AXIOS_DEFAULTS);
    if (res.data.status && res.data.result?.download?.url) return { download: res.data.result.download.url, title: res.data.result.metadata.title };
    throw new Error('Vreden failed');
}

module.exports = {
    pattern: "song",
    desc: "Download audio/song from YouTube",
    react: "🎵",
    category: "music",
    use: ".song <song name or YouTube link>",
    filename: __filename,

    execute: async (conn, mek, m, { from, q, reply }) => {
        if (!q) return reply("❌ Please provide a song name or YouTube link.\n📌 *Usage:* `.song <name or link>`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");

        try {
            for (const emoji of ['📥', '⏳', '🎵']) {
                await conn.sendMessage(from, { react: { text: emoji, key: mek.key } });
            }

            let video;
            if (q.includes('youtube.com') || q.includes('youtu.be')) {
                video = { url: q, title: 'YouTube Audio', thumbnail: 'https://i.imgur.com/2wzGhpF.jpeg', timestamp: 'N/A' };
            } else {
                const search = await yts(q);
                if (!search?.videos?.length) return reply('❌ No results found. Try a different name.');
                video = search.videos[0];
            }

            await conn.sendMessage(from, {
                image: { url: video.thumbnail || 'https://i.imgur.com/2wzGhpF.jpeg' },
                caption: `🎵 *Downloading:* ${video.title}\n⏱ *Duration:* ${video.timestamp || 'N/A'}`
            }, { quoted: mek });

            let audioBuffer, downloadSuccess = false, finalTitle = video.title;

            const apis = [
                { name: 'EliteProTech', fn: () => getEliteProTechDownload(video.url) },
                { name: 'Yupra', fn: () => getYupraDownload(video.url) },
                { name: 'Vreden', fn: () => getVredenDownload(video.url) }
            ];

            for (const api of apis) {
                try {
                    const data = await api.fn();
                    if (!data.download) continue;
                    finalTitle = data.title || finalTitle;
                    const audioRes = await axios.get(data.download, { responseType: 'arraybuffer', timeout: 120000 });
                    audioBuffer = Buffer.from(audioRes.data);
                    if (audioBuffer?.length > 0) { downloadSuccess = true; break; }
                } catch (err) { console.log(`${api.name} failed:`, err.message); }
            }

            if (!downloadSuccess) throw new Error('All download sources failed.');

            await conn.sendMessage(from, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${finalTitle.replace(/[^\w\s-]/g, '')}.mp3`,
                ptt: false
            }, { quoted: mek });

            await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

        } catch (err) {
            console.error('Song error:', err);
            await conn.sendMessage(from, { react: { text: '❌', key: mek.key } });
            await reply(`❌ Error: ${err.message}`);
        }
    }
};
