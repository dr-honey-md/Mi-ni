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

function isAntiDeleteEnabled(groupId) {
    return loadSettings()[groupId] === true;
}

function setAntiDelete(groupId, status) {
    const settings = loadSettings();
    settings[groupId] = status;
    return saveSettings(settings);
}

module.exports = {
    // ── Export helpers so server.js can use them ────────────────────────
    isAntiDeleteEnabled,

    // ── Command ─────────────────────────────────────────────────────────
    pattern: "antidelete",
    desc: "Toggle antidelete for this group (recover deleted messages)",
    category: "group",
    react: "🛡️",
    use: ".antidelete on/off",
    filename: __filename,

    execute: async (conn, message, m, { q, reply, from, isGroup, sender }) => {
        try {
            if (!isGroup) {
                return reply("❌ This command only works in groups!");
            }

            const jidToBase = (jid) => String(jid).split("@")[0].split(":")[0];
            const senderBase = jidToBase(sender);
            const botBase = jidToBase(conn?.user?.id || "");

            // Owner check
            let owners = [];
            if (process.env.OWNER_NUMBER) {
                owners = process.env.OWNER_NUMBER.split(",").map(n => n.trim());
            }
            const isOwner = botBase === senderBase || owners.includes(senderBase);

            // Admin check
            let isAdmin = false;
            try {
                const metadata = await conn.groupMetadata(from);
                const participant = metadata.participants.find(p => jidToBase(p.id) === senderBase);
                isAdmin = participant?.admin === "admin" || participant?.admin === "superadmin";
            } catch {
                return reply("❌ Failed to get group info.");
            }

            if (!isOwner && !isAdmin) {
                return reply("❌ Only group admins or owner can use this command!");
            }

            const currentStatus = isAntiDeleteEnabled(from);

            if (!q) {
                return reply(
`╭━━〔 🛡️ ANTIDELETE STATUS 〕━━┈⊷
┃
┃ 📌 Group: ${from.split('@')[0]}
┃ 📡 Status: ${currentStatus ? '✅ ON' : '❌ OFF'}
┃
┃ 📝 Usage:
┃ .antidelete on  - Enable
┃ .antidelete off - Disable
┃
╰━━━━━━━━━━━━━━━━━━━━━┈⊷`
                );
            }

            if (q.toLowerCase() === "on") {
                setAntiDelete(from, true);
                await conn.sendMessage(from, { react: { text: "✅", key: message.key } });
                return reply("🛡️ *AntiDelete ENABLED!*\nDeleted messages will be recovered.");
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
