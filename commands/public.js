module.exports = {
    pattern: "public",
    desc: "Set bot to public mode (everyone can use)",
    react: "🌍",
    category: "owner",
    use: ".public",
    filename: __filename,

    execute: async (conn, mek, m, { from, isOwner, reply }) => {
        if (!isOwner) return reply("❌ Only owner can use this command.");

        await conn.sendMessage(from, { react: { text: '🌍', key: mek.key } });
        await reply("🌍 *Bot is now in PUBLIC mode.*\nEveryone can use it.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
    }
};
