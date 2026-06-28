module.exports = {
    pattern: "kick",
    desc: "Kick a member from the group",
    react: "👢",
    category: "admin",
    use: ".kick @user or reply to message",
    filename: __filename,

    execute: async (conn, mek, m, { from, isAdmin, reply }) => {
        if (!isAdmin) return reply("❌ Only admin can use this command.");
        if (!from.endsWith('@g.us')) return reply("❌ This command can only be used in groups.");

        await conn.sendMessage(from, { react: { text: '👢', key: mek.key } });

        const quoted = mek.message?.extendedTextMessage?.contextInfo?.participant ||
            mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

        if (!quoted) return reply("❌ Please reply to a message or tag someone to kick.");

        try {
            await conn.groupParticipantsUpdate(from, [quoted], "remove");
            await reply(`✅ *User kicked successfully.*\n📱 +${quoted.split('@')[0]}\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`);
        } catch (e) {
            await reply("❌ Failed to kick user. Make sure I am an admin.");
        }
    }
};
