module.exports = {
    pattern: "anticall",
    desc: "Enable/Disable anti-call feature",
    react: "📵",
    category: "owner",
    use: ".anticall [on/off]",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, isOwner, reply }) => {
        if (!isOwner) return reply("❌ Only owner can use this command.");

        await conn.sendMessage(from, { react: { text: "📵", key: mek.key } });

        const action = args[0]?.toLowerCase();
        if (action === 'on') {
            return reply("✅ *Anti-Call Enabled!*\nAll incoming calls will be rejected automatically.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else if (action === 'off') {
            return reply("❌ *Anti-Call Disabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else {
            return reply("❌ *Usage:* `.anticall on` or `.anticall off`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        }
    }
};
