module.exports = {
    pattern: "antilink",
    desc: "Enable/Disable anti-link in group",
    react: "🔗",
    category: "admin",
    use: ".antilink [on/off/kick]",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, isAdmin, reply }) => {
        if (!from.endsWith('@g.us')) return reply("❌ This command only works in groups.");
        if (!isAdmin) return reply("❌ Only admin can use this command in groups.");

        await conn.sendMessage(from, { react: { text: "🔗", key: mek.key } });

        const action = args[0]?.toLowerCase();
        if (action === 'on' || action === 'del') {
            return reply("✅ *Anti-Link (Delete Only) Enabled!*\nLinks will be deleted automatically.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else if (action === 'kick') {
            return reply("✅ *Anti-Link (Kick + Delete) Enabled!*\nSenders will be kicked and links deleted.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else if (action === 'off') {
            return reply("❌ *Anti-Link Disabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else {
            return reply("❌ *Usage:* `.antilink on` / `.antilink off` / `.antilink kick`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        }
    }
};
