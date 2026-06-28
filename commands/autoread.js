module.exports = {
    pattern: "autoread",
    desc: "Enable/Disable auto-read all messages",
    react: "👁️",
    category: "owner",
    use: ".autoread [on/off]",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, isOwner, reply }) => {
        if (!isOwner) return reply('❌ This command is only available for the owner!');

        await conn.sendMessage(from, { react: { text: "👁️", key: mek.key } });

        const action = args[0]?.toLowerCase();
        if (action === 'on' || action === 'enable') {
            return reply("✅ *Auto-Read Enabled!*\nAll messages will be marked as read automatically.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else if (action === 'off' || action === 'disable') {
            return reply("❌ *Auto-Read Disabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else {
            return reply("❌ *Usage:* `.autoread on` or `.autoread off`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        }
    }
};
