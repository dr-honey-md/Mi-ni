module.exports = {
    pattern: "status",
    desc: "Manage auto-status settings (seen, like, download)",
    react: "📊",
    category: "owner",
    use: ".status [on/off/seen/like/download]",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, isOwner, reply }) => {
        if (!isOwner) return reply("❌ Only owner can use this command.");

        await conn.sendMessage(from, { react: { text: '📊', key: mek.key } });

        const action = args[0]?.toLowerCase();

        if (!action) {
            return reply(
                `╭━━━〔 📊 *STATUS SETTINGS* 〕━━━┈⊷\n` +
                `┃ ⋄ *Commands:*\n` +
                `┃ .status on — Enable All\n` +
                `┃ .status off — Disable All\n` +
                `┃ .status seen on/off\n` +
                `┃ .status like on/off\n` +
                `┃ .status download on/off\n` +
                `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                `> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            );
        }

        const val = args[1]?.toLowerCase();

        if (action === 'on') return reply("✅ *ALL STATUS FEATURES: ON*\n◇ Auto Seen: ✅\n◇ Auto Like: ✅\n◇ Auto Download: ✅\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        if (action === 'off') return reply("❌ *ALL STATUS FEATURES: OFF*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        if (action === 'seen') return reply(val === 'on' ? "✅ *Auto Seen: ON*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀" : "❌ *Auto Seen: OFF*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        if (action === 'like') return reply(val === 'on' ? "✅ *Auto Like: ON*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀" : "❌ *Auto Like: OFF*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        if (action === 'download') return reply(val === 'on' ? "✅ *Auto Download: ON*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀" : "❌ *Auto Download: OFF*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");

        return reply("❌ Invalid option. Use `.status` to see all options.");
    }
};
