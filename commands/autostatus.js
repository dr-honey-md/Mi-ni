module.exports = {
    pattern: "autostatus",
    desc: "Enable/Disable auto status seen, like & download",
    react: "📊",
    category: "owner",
    use: ".autostatus [on/off]",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, isOwner, reply }) => {
        if (!isOwner) return reply("❌ Only owner can use this command.");

        await conn.sendMessage(from, { react: { text: "📊", key: mek.key } });

        const action = args[0]?.toLowerCase();
        if (action === 'on') {
            return reply("✅ *Auto-Status Enabled!*\n\n◇ Auto Seen: ON\n◇ Auto Like: ON\n◇ Auto Download: ON\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else if (action === 'off') {
            return reply("❌ *Auto-Status Disabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else {
            return reply("❌ *Usage:* `.autostatus on` or `.autostatus off`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        }
    }
};
