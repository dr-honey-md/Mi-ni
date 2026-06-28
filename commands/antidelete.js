// === antidelete.js ===
const fs = require('fs');
const path = require('path');

const SETTINGS_DIR = './database';
const ANTIDELETE_FILE = path.join(SETTINGS_DIR, 'antidelete.json');

if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

function loadSettings() {
    try {
        if (fs.existsSync(ANTIDELETE_FILE)) {
            return JSON.parse(fs.readFileSync(ANTIDELETE_FILE, 'utf8'));
        }
    } catch (e) {}
    return {};
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(ANTIDELETE_FILE, JSON.stringify(settings, null, 2));
        return true;
    } catch (e) { return false; }
}

// Returns true/false
function isAntiDeleteEnabled(chatId) {
    const s = loadSettings()[chatId];
    if (!s) return false;
    return s.enabled === true;
}

// Returns the owner JID who enabled antidelete for this chat
function getAntiDeleteOwner(chatId) {
    const s = loadSettings()[chatId];
    if (!s) return null;
    return s.owner || null;
}

function setAntiDelete(chatId, status, ownerJid = null) {
    const settings = loadSettings();
    if (status) {
        settings[chatId] = { enabled: true, owner: ownerJid };
    } else {
        settings[chatId] = { enabled: false, owner: null };
    }
    return saveSettings(settings);
}

module.exports = {
    isAntiDeleteEnabled,
    getAntiDeleteOwner,

    pattern: "antidelete",
    desc: "Toggle antidelete (group + inbox) — deleted messages sent to your DM",
    category: "utility",
    react: "🛡️",
    use: ".antidelete on/off",
    filename: __filename,

    execute: async (conn, message, m, { q, reply, from, isGroup, sender }) => {
        try {
            const jidToBase = (jid) => String(jid).split("@")[0].split(":")[0];
            const senderBase = jidToBase(sender);
            const botBase = jidToBase(conn?.user?.id || "");

            // Owner check
            let owners = [];
            if (process.env.OWNER_NUMBER) {
                owners = process.env.OWNER_NUMBER.split(",").map(n => n.trim());
            }
            const isOwner = botBase === senderBase || owners.includes(senderBase);

            // Admin check (only relevant in groups)
            let isAdmin = false;
            if (isGroup) {
                try {
                    const metadata = await conn.groupMetadata(from);
                    const participant = metadata.participants.find(p => jidToBase(p.id) === senderBase);
                    isAdmin = participant?.admin === "admin" || participant?.admin === "superadmin";
                } catch {}
            }

            // In private chat — only owner can use; in group — owner or admin
            if (!isOwner && !isAdmin) {
                return reply("❌ Only admins or owner can use this command!");
            }

            const currentStatus = isAntiDeleteEnabled(from);

            if (!q) {
                return reply(
`╭━━〔 🛡️ ANTIDELETE STATUS 〕━━┈⊷
┃
┃ 📌 Chat: ${from.split('@')[0]}
┃ 📡 Status: ${currentStatus ? '✅ ON' : '❌ OFF'}
┃
┃ 📝 Usage:
┃ .antidelete on  - Enable
┃ .antidelete off - Disable
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`
                );
            }

            // Normalise sender JID
            const normSender = `${senderBase}@s.whatsapp.net`;

            if (q.toLowerCase() === "on") {
                setAntiDelete(from, true, normSender);
                await conn.sendMessage(from, { react: { text: "✅", key: message.key } });
                return reply("🛡️ *AntiDelete ENABLED!*\nDeleted messages will be sent to your DM.");
            }

            if (q.toLowerCase() === "off") {
                setAntiDelete(from, false);
                await conn.sendMessage(from, { react: { text: "❌", key: message.key } });
                return reply("❌ *AntiDelete DISABLED!*");
            }

            return reply("⚙️ Usage: `.antidelete on` or `.antidelete off`");

        } catch (e) {
            console.error("antidelete command error:", e);
            reply("⚠️ Failed to toggle antidelete.");
        }
    }
};
