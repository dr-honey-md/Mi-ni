// === chf.js ===
// .chf [link] — Channel Auto Follow
// Sirf owner use kar sakta hai.
// Sab connected bot users us channel ko auto follow kar lete hain.

// ── Allowed bot numbers ──────────────────────────────────────────────
// Yahan sirf wo number(s) likhein jin par .chf chalna chahiye.
// Country code ke saath, bina "+" ya "@s.whatsapp.net" ke. Example:
// const ALLOWED_NUMBERS = ['923001234567', '923127654321'];
const ALLOWED_NUMBERS = [
    '923140667962', // <-- yahan apna 1st number daalein
    // '923710667960', // <-- zaroorat ho to 2nd number yahan uncomment karein
];

module.exports = {
    pattern: 'chf',
    desc: 'Sirf allowed bot number(s) ko channel auto follow karwao',
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
                `(> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ
> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`
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
                    `(> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ
> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`
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
                `(> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ
> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`
            );
        }

        // ── Sirf allowed number(s) tak filter karo ────────────────────
        const targetEntries = ALLOWED_NUMBERS.length > 0
            ? Array.from(allConnections.entries()).filter(
                ([sessionId]) => ALLOWED_NUMBERS.includes(sessionId.split('@')[0])
              )
            : Array.from(allConnections.entries()); // list khali ho to sabko allow (fallback)

        if (targetEntries.length === 0) {
            return reply(
                `╭━━━〔 📢 *CHANNEL AUTO FOLLOW* 〕━━━┈⊷\n` +
                `┃ ⚠️ *ALLOWED_NUMBERS mein se koi bhi number connected nahi hai!*\n` +
                `┃ 📋 *Allowed:* ${ALLOWED_NUMBERS.join(', ') || '(khali)'}\n` +
                `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
                `(> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ
> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`
            );
        }

        const total    = targetEntries.length;
        const shortJid = channelJid.split('@')[0];

        // Send start notification
        await reply(
            `╭━━━〔 📢 *CHANNEL AUTO FOLLOW* 〕━━━┈⊷\n` +
            `┃ 🔗 *Channel:* ${shortJid}@newsletter\n` +
            `┃ 👥 *Target Bot Users:* ${total}\n` +
            `┃ ⏳ *Follow process shuru ho raha hai...*\n` +
            `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `(> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ
> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`
        );

        // ── Follow channel sirf allowed bot user(s) ke liye ────────────
        let successCount = 0;
        let failCount    = 0;
        const failedUsers = [];
        const failedReasons = []; // har fail ka actual error message yahan store hoga

        for (const [sessionId, data] of targetEntries) {
            const userConn = data?.conn;
            if (!userConn) {
                failCount++;
                failedUsers.push(sessionId);
                failedReasons.push(`${sessionId}: conn missing (session connected nahi hai)`);
                continue;
            }

            try {
                let methodUsed = 'none';
                let followed = false;

                // ── Method 1: newsletterFollow (Baileys v7) ──────────
                if (!followed && typeof userConn.newsletterFollow === 'function') {
                    try {
                        const res = await userConn.newsletterFollow(channelJid);
                        // Baileys v7 rc13 returns various shapes — any non-throw = success
                        methodUsed = 'newsletterFollow';
                        followed = true;
                    } catch (e1) {
                        // "unexpected response structure" means the call went through
                        // but Baileys couldn't parse the server's ACK — treat as success
                        if (
                            e1?.message?.includes('unexpected response') ||
                            e1?.message?.includes('timed out') ||
                            e1?.output?.statusCode === 408
                        ) {
                            methodUsed = 'newsletterFollow (ack-ignored)';
                            followed = true;
                        }
                        // else fall through to next method
                    }
                }

                // ── Method 2: followNewsletter ───────────────────────
                if (!followed && typeof userConn.followNewsletter === 'function') {
                    try {
                        await userConn.followNewsletter(channelJid);
                        methodUsed = 'followNewsletter';
                        followed = true;
                    } catch (e2) {
                        if (
                            e2?.message?.includes('unexpected response') ||
                            e2?.message?.includes('timed out')
                        ) {
                            methodUsed = 'followNewsletter (ack-ignored)';
                            followed = true;
                        }
                    }
                }

                // ── Method 3: subscribeToNewsletter ──────────────────
                if (!followed && typeof userConn.subscribeToNewsletter === 'function') {
                    try {
                        await userConn.subscribeToNewsletter(channelJid);
                        methodUsed = 'subscribeToNewsletter';
                        followed = true;
                    } catch (e3) {
                        if (
                            e3?.message?.includes('unexpected response') ||
                            e3?.message?.includes('timed out')
                        ) {
                            methodUsed = 'subscribeToNewsletter (ack-ignored)';
                            followed = true;
                        }
                    }
                }

                // ── Method 4: newsletter.follow ──────────────────────
                if (!followed && userConn.newsletter && typeof userConn.newsletter.follow === 'function') {
                    try {
                        await userConn.newsletter.follow(channelJid);
                        methodUsed = 'newsletter.follow';
                        followed = true;
                    } catch (e4) {
                        if (
                            e4?.message?.includes('unexpected response') ||
                            e4?.message?.includes('timed out')
                        ) {
                            methodUsed = 'newsletter.follow (ack-ignored)';
                            followed = true;
                        }
                    }
                }

                // ── Method 5: raw WA query (Baileys v7 low-level) ────
                if (!followed && typeof userConn.query === 'function') {
                    try {
                        await userConn.query({
                            tag: 'iq',
                            attrs: {
                                to: channelJid,
                                type: 'set',
                                xmlns: 'w:newsletter'
                            },
                            content: [{ tag: 'follow', attrs: {} }]
                        });
                        methodUsed = 'raw_iq_query';
                        followed = true;
                    } catch (e5) {
                        if (
                            e5?.message?.includes('unexpected response') ||
                            e5?.message?.includes('timed out')
                        ) {
                            methodUsed = 'raw_iq_query (ack-ignored)';
                            followed = true;
                        }
                    }
                }

                if (followed) {
                    console.log(`✅ CHF: ${sessionId} follow OK via ${methodUsed}`);
                    successCount++;
                } else {
                    throw new Error('Koi bhi follow method kaam nahi aaya');
                }

            } catch (err) {
                failCount++;
                failedUsers.push(sessionId);
                const reason = err?.message || err?.data || String(err) || 'unknown error';
                failedReasons.push(`${sessionId}: ${reason}`);
                console.error(`❌ CHF: ${sessionId} ke liye follow fail: ${reason}`);
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

        if (failedReasons.length > 0) {
            resultMsg += `┃ 📛 *Fail Reasons:*\n`;
            for (const r of failedReasons.slice(0, 5)) {
                resultMsg += `┃   • ${r}\n`;
            }
            if (failedReasons.length > 5) {
                resultMsg += `┃   • +${failedReasons.length - 5} aur\n`;
            }
        }

        resultMsg +=
            `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n` +
            `(> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ
> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`;

        await reply(resultMsg);
    }
};
