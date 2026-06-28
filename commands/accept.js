module.exports = {
    pattern: "accept",
    desc: "Accept all pending group join requests",
    react: "✅",
    category: "admin",
    use: ".accept",
    filename: __filename,

    execute: async (conn, mek, m, { from, isAdmin, reply }) => {
        if (!from.endsWith('@g.us')) {
            return reply('❌ This command can only be used in groups.');
        }
        if (!isAdmin) {
            return reply('❌ Only group admins can use this command.');
        }

        try {
            const response = await conn.groupRequestParticipantsList(from);

            if (!response || response.length === 0) {
                return reply('✅ No pending join requests found in this group.');
            }

            await reply(`⏳ Found *${response.length}* pending requests. Starting auto-accept...`);

            let acceptedCount = 0;
            for (const participant of response) {
                try {
                    await conn.groupRequestParticipantsUpdate(from, [participant.jid], 'approve');
                    acceptedCount++;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (err) {
                    console.error(`Failed to accept ${participant.jid}:`, err.message);
                }
            }

            await reply(`✅ Successfully accepted *${acceptedCount}* pending requests.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`);

        } catch (e) {
            console.error('Accept command error:', e);
            await reply('❌ Error: ' + e.message);
        }
    }
};
