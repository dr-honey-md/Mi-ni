module.exports = {
    pattern: "ping",
    desc: "Check bot response speed",
    react: "⚡",
    category: "utility",
    use: ".ping",
    filename: __filename,

    execute: async (conn, mek, m, { from, reply }) => {
        const start = Date.now();
        const sentMsg = await conn.sendMessage(from, { text: '🏓 Testing Speed...' }, { quoted: mek });
        const end = Date.now();
        await conn.sendMessage(from, {
            text: `⚡ *Response Speed:* ${end - start}ms\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`,
            edit: sentMsg.key
        });
    }
};
