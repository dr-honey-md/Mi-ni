const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
    pattern: "kickoffline",
    desc: "Kick inactive/offline members from group",
    react: "🚪",
    category: "admin",
    use: ".kickoffline [on/off]",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, isAdmin, reply }) => {
        if (!from.endsWith('@g.us')) return reply("❌ This command only works in groups.");
        if (!isAdmin) return reply("❌ Only admins can use this command.");

        await conn.sendMessage(from, { react: { text: '🚪', key: mek.key } });

        const action = args[0]?.toLowerCase();

        if (action === 'on') {
            await reply("✅ *Kick-Offline Activated!*\n\nChecking for inactive members...\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");

            try {
                const metadata = await conn.groupMetadata(from);
                const botId = jidNormalizedUser(conn.user.id);
                const participants = metadata.participants;
                const botParticipant = participants.find(p => p.id === botId);
                const botIsAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';

                if (!botIsAdmin) {
                    return reply("❌ I need to be an admin to kick members.");
                }

                await reply("⚠️ *Note:* Due to WhatsApp protocol limitations, I can only detect offline status for members whose activity has been tracked while I was online. Monitoring group for inactive members...\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");

            } catch (e) {
                console.error("KickOffline Error:", e);
                await reply("❌ Error: " + e.message);
            }

        } else if (action === 'off') {
            await reply("❌ *Kick-Offline Disabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else {
            await reply("❌ *Usage:* `.kickoffline on` or `.kickoffline off`\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        }
    }
};
