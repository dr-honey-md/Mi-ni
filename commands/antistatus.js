module.exports = {
    pattern: "antistatus",
    desc: "Enable/Disable auto-delete status shares in group",
    react: "🚫",
    category: "admin",
    use: ".antistatus [on/off]",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, isAdmin, reply }) => {
        if (!from.endsWith('@g.us')) return reply("❌ This command only works in groups.");
        if (!isAdmin) return reply("❌ Only admins can use this command.");

        await conn.sendMessage(from, { react: { text: "🚫", key: mek.key } });

        const action = args[0]?.toLowerCase();
        if (action === 'on') {
            return reply("✅ *Anti-Status Enabled!*\nAny status shared in this group will be automatically deleted.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else if (action === 'off') {
            return reply("❌ *Anti-Status Disabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else {
            return reply("❌ *Usage:* `.antistatus on` or `.antistatus off`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        }
    }
};
