// === chf.js ===
// .chf [link] — Channel Auto Follow
// Sirf owner use kar sakta hai.
// Sab connected bot users us channel ko auto follow kar lete hain.

module.exports = {
    pattern: 'chf',
    desc: 'All bot users ko channel auto follow karwao',
    react: '📢',
    category: 'owner',
    use: '.chf [whatsapp channel link ya JID]',
    filename: __filename,

    execute: async (conn, mek, m, { from, q, reply, isOwner, sender }) => {

        // ── Owner check ──────────────────────────────────────────────
        const senderBase = (sender || m?.sender || '').split('@')[0];
        const botBase    = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : null;
        let ownerNumbers = [];
        if (process.env.OWNER_NUMBER) {
            ownerNumbers = process.env.OWNER_NUMBER.split(',').map(n => n.trim());
        }
        const ownerCheck = mek?.key?.fromMe
            || (botBase && senderBase && botBase === senderBase)
            || ownerNumbers.includes(senderBase)
            || (typeof isOwner === 'boolean' && isOwner);

        if (!ownerCheck) {
            return reply('❌ *Sirf Owner hi yeh command use kar sakta hai!*');
        }

        // ── Input validation ─────────────────────────────────────────
        const rawInput = (q || '').trim();
        if (!rawInput) {
            return reply(
                `╭━━━〔 📢 *CHANNEL AUTO FOLLOW* 〕━━━┈⊷\n` +
                `┃ ❌ *Channel link ya JID dena zaroori hai!*\n` +
                `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                `*Usage:* .chf https://whatsapp.com/channel/XXXX\n` +
                `*Ya:* .chf 120363XXXXXXXXXX@newsletter\n\n` +
                `> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            );
        }

        // ── Resolve channel JID ──────────────────────────────────────
        // Accepts:
        //   https://whatsapp.com/channel/XXXX
        //   invite:XXXX
        //   XXXX@newsletter  (direct JID)
        //   XXXX             (raw invite code)
        let channelJid = rawInput;
        let inviteCode = null;

        if (channelJid.endsWith('@newsletter')) {
            // Already a JID — resolve metadata to validate it exists
            inviteCode = null;
        } else {
            const linkMatch = channelJid.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
            if (linkMatch) {
                inviteCode = linkMatch[1];
            } else if (channelJid.startsWith('invite:')) {
                inviteCode = channelJid.slice(7);
            } else {
                inviteCode = channelJid; // treat as raw invite code
            }
        }

        // Resolve invite code → real @newsletter JID using THIS bot's conn
        if (inviteCode) {
            try {
                const meta = await conn.newsletterMetadata('invite', inviteCode);
                if (meta && meta.id) {
                    channelJid = meta.id;
                } else {
                    throw new Error('Meta me JID nahi mila');
                }
            } catch (err) {
                return reply(
                    `╭━━━〔 📢 *CHANNEL AUTO FOLLOW* 〕━━━┈⊷\n` +
                    `┃ ❌ *Channel resolve nahi hua!*\n` +
                    `┃ 📛 Error: ${err.message}\n` +
                    `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                    `> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
                );
            }
        }

        // ── Get all active connections ────────────────────────────────
        const allConnections = global.activeConnections;
        if (!allConnections || allConnections.size === 0) {
            return reply(
                `╭━━━〔 📢 *CHANNEL AUTO FOLLOW* 〕━━━┈⊷\n` +
                `┃ ⚠️ *Koi bhe active bot user nahi mila!*\n` +
                `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                `> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            );
        }

        const total    = allConnections.size;
        const shortJid = channelJid.split('@')[0];

        // Send start notification
        await reply(
            `╭━━━〔 📢 *CHANNEL AUTO FOLLOW* 〕━━━┈⊷\n` +
            `┃ 🔗 *Channel:* ${shortJid}@newsletter\n` +
            `┃ 👥 *Total Bot Users:* ${total}\n` +
            `┃ ⏳ *Follow process shuru ho raha hai...*\n` +
            `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
        );

        // ── Follow channel for every connected bot user ───────────────
        let successCount = 0;
        let failCount    = 0;
        const failedUsers = [];

        for (const [sessionId, data] of allConnections.entries()) {
            const userConn = data?.conn;
            if (!userConn) { failCount++; continue; }

            try {
                if (typeof userConn.newsletterFollow === 'function') {
                    await userConn.newsletterFollow(channelJid);
                } else if (typeof userConn.followNewsletter === 'function') {
                    await userConn.followNewsletter(channelJid);
                } else if (typeof userConn.subscribeToNewsletter === 'function') {
                    await userConn.subscribeToNewsletter(channelJid);
                } else if (userConn.newsletter && typeof userConn.newsletter.follow === 'function') {
                    await userConn.newsletter.follow(channelJid);
                } else {
                    // Fallback: presence update only
                    await userConn.sendPresenceUpdate('available', channelJid);
                }
                successCount++;
            } catch (err) {
                failCount++;
                failedUsers.push(sessionId);
                console.error(`❌ CHF: ${sessionId} ke liye follow fail: ${err.message}`);
            }

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // ── Final result reply ────────────────────────────────────────
        let resultMsg =
            `╭━━━〔 📢 *CHANNEL AUTO FOLLOW COMPLETE* 〕━━━┈⊷\n` +
            `┃ 🔗 *Channel:* ${shortJid}@newsletter\n` +
            `┃ 👥 *Total Users:* ${total}\n` +
            `┃ ✅ *Successfully Followed:* ${successCount}\n` +
            `┃ ❌ *Failed:* ${failCount}\n`;

        if (failedUsers.length > 0) {
            resultMsg += `┃ 📛 *Failed Sessions:* ${failedUsers.slice(0, 5).join(', ')}${failedUsers.length > 5 ? ` +${failedUsers.length - 5} aur` : ''}\n`;
        }

        resultMsg +=
            `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`;

        await reply(resultMsg);
    }
};
