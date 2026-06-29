const { getMode, setMode } = require('../lib/botMode');

function isSenderOwner(conn, sender) {
    try {
        const botBase = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : null;
        const senderBase = sender ? sender.split('@')[0] : null;

        let owners = [];
        if (process.env.OWNER_NUMBER) {
            owners = process.env.OWNER_NUMBER.split(',').map(num => num.trim());
        }

        return (botBase && senderBase && botBase === senderBase) || owners.includes(senderBase);
    } catch (error) {
        return false;
    }
}

module.exports = {
    pattern: 'mode',
    desc: 'Set bot mode to public (everyone can use) or private (only owner can use)',
    react: '⚙️',
    category: 'owner',
    use: '.mode public / .mode privet',
    filename: __filename,

    execute: async (conn, mek, m, { from, args, q, reply, sender, isOwner }) => {
        const senderJid = sender || m?.sender;
        const ownerCheck = (typeof isOwner === 'boolean') ? isOwner : (mek?.key?.fromMe || isSenderOwner(conn, senderJid));

        if (!ownerCheck) {
            return reply('❌ Only owner can use this command.');
        }

        const choice = (args && args[0] ? args[0] : q || '').toString().trim().toLowerCase();

        if (!choice) {
            const current = getMode();
            return reply(
                `⚙️ *Current mode:* ${current === 'private' ? '🔐 PRIVATE' : '🌍 PUBLIC'}\n\n` +
                `Use:\n.mode public\n.mode privet`
            );
        }

        if (choice === 'public') {
            setMode('public');
            await conn.sendMessage(from, { react: { text: '🌍', key: mek.key } });
            return reply('🌍 *Bot is now in PUBLIC mode.*\nEveryone can use all commands.\n\n> DR-HONEY-MINI | Dr Honey TechX 💀');
        }

        if (choice === 'privet' || choice === 'private') {
            setMode('private');
            await conn.sendMessage(from, { react: { text: '🔐', key: mek.key } });
            return reply('🔐 *Bot is now in PRIVATE mode.*\nOnly the owner number can use commands now.\n\n> DR-HONEY-MINI | Dr Honey TechX 💀');
        }

        return reply('❌ Invalid option.\nUse:\n.mode public\n.mode privet');
    }
};
