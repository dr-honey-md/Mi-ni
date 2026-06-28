module.exports = {
    pattern: "setname",
    desc: "Set a custom name for a user",
    react: "✏️",
    category: "owner",
    use: ".setname <name>",
    filename: __filename,

    execute: async (conn, mek, m, { from, q, isOwner, reply }) => {
        if (!isOwner) return reply("❌ Only owner can use this command.");
        if (!q) return reply("❌ Please provide a name.\n\n📌 *Usage:* `.setname <name>`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");

        await conn.sendMessage(from, { react: { text: '✏️', key: mek.key } });
        await reply(`✅ *Name set to:* ${q}\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`);
    }
};
