module.exports = {
    pattern: "tagall",
    desc: "Tag all members in the group",
    react: "📢",
    category: "admin",
    use: ".tagall [message]",
    filename: __filename,

    execute: async (conn, mek, m, { from, q, isAdmin, reply }) => {
        if (!isAdmin) return reply("❌ Only admin can use this command in groups.");
        if (!from.endsWith('@g.us')) return reply("❌ This command can only be used in groups.");

        await conn.sendMessage(from, { react: { text: '📢', key: mek.key } });

        const groupMetadata = await conn.groupMetadata(from);
        const participants = groupMetadata.participants;

        let tagText = `╭━━━〔 📢 *TAG ALL* 〕━━━┈⊷\n`;
        if (q) tagText += `┃ 📝 *Message:* ${q}\n`;
        tagText += `┃ 👥 *Members:* ${participants.length}\n`;
        tagText += `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n`;

        for (let mem of participants) {
            tagText += `🔹 @${mem.id.split('@')[0]}\n`;
        }

        tagText += `\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`;

        await conn.sendMessage(from, {
            text: tagText,
            mentions: participants.map(p => p.id)
        }, { quoted: mek });
    }
};
