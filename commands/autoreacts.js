module.exports = {
    pattern: "autoreacts",
    desc: "Enable/Disable auto-react to messages",
    react: "😍",
    category: "owner",
    use: ".autoreacts [on/off]",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, isOwner, reply }) => {
        if (!isOwner) return reply("❌ Only owner can use this command.");

        await conn.sendMessage(from, { react: { text: "😍", key: mek.key } });

        const action = args[0]?.toLowerCase();
        if (action === 'on') {
            return reply("✅ *Auto-React Enabled!*\nBot will react to all incoming messages.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else if (action === 'off') {
            return reply("❌ *Auto-React Disabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else {
            return reply("❌ *Usage:* `.autoreacts on` or `.autoreacts off`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        }
    }
};
