module.exports = {
    pattern: "private",
    desc: "Set bot to private mode (owner only)",
    react: "🔐",
    category: "owner",
    use: ".private",
    filename: __filename,

    execute: async (conn, mek, m, { from, isOwner, reply }) => {
        if (!isOwner) return reply("❌ Only owner can use this command.");

        await conn.sendMessage(from, { react: { text: '🔐', key: mek.key } });
        await reply("🔐 *Bot is now in PRIVATE mode.*\nOnly the owner can use it.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
    }
};
