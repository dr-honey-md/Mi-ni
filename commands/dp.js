module.exports = {
    pattern: "dp",
    desc: "Get profile picture of a user",
    react: "🖼️",
    category: "utility",
    use: ".dp @user or reply to a message",
    filename: __filename,

    execute: async (conn, mek, m, { from, reply }) => {
        try {
            await conn.sendMessage(from, { react: { text: '⏳', key: mek.key } });

            let target;

            if (mek.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                target = mek.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else if (mek.message?.extendedTextMessage?.contextInfo?.participant) {
                target = mek.message.extendedTextMessage.contextInfo.participant;
            } else {
                target = from.endsWith('@g.us')
                    ? (mek.key.participant || mek.participant)
                    : from;
            }

            if (!target) target = mek.key.participant || mek.participant || from;

            let ppUrl;
            try {
                ppUrl = await conn.profilePictureUrl(target, 'image');
            } catch {
                ppUrl = 'https://i.imgur.com/2wzGhpF.jpeg';
            }

            const number = target.split('@')[0];
            await conn.sendMessage(from, {
                image: { url: ppUrl },
                caption: `╭━━━〔 🖼️ *PROFILE PICTURE* 〕━━━┈⊷\n┃ 📱 *Number:* +${number}\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            }, { quoted: mek });

            await conn.sendMessage(from, { react: { text: '✅', key: mek.key } });

        } catch (e) {
            console.error("DP Command Error:", e.message);
            await reply('❌ Could not fetch profile picture. User may have hidden it.');
        }
    }
};
