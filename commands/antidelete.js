const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');

// config shape: { mode: "off" | "on" | "dm", owner: "<jid>" }
function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { mode: "off", owner: null };
        const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH));
        // migrate old { enabled: bool } configs
        if (typeof cfg.mode === "undefined") {
            return { mode: cfg.enabled ? "on" : "off", owner: cfg.owner || null };
        }
        return cfg;
    } catch { return { mode: "off", owner: null }; }
}

function saveConfig(config) {
    try {
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (e) { console.error('Antidelete save error:', e); }
}

// ── Exported helpers used by server.js ──────────────────────────────────
function isAntiDeleteEnabled(from) {
    const config = loadConfig();
    if (config.mode === "off" || !config.owner) return false;
    if (config.mode === "on" || config.mode === "dm") return true; // monitors all chats (group + DM)
    return false;
}

function getAntiDeleteOwner(from) {
    const config = loadConfig();
    return config.owner || null;
}

module.exports = {
    pattern: "antidelete",
    desc: "Enable/Disable anti-delete (sends deleted messages to owner)",
    react: "🔍",
    category: "owner",
    use: ".antidelete (on/off/dm)",
    filename: __filename,

    execute: async (conn, mek, m, { from, sender, args, isOwner, reply }) => {
        if (!isOwner) return reply("❌ Only owner can use this command.");

        await conn.sendMessage(from, { react: { text: '🔍', key: mek.key } });

        const action = args[0]?.toLowerCase();
        const config = loadConfig();

        const brand = `> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ\n> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`;

        if (action === 'on') {
            config.mode = "on";
            config.owner = sender;
            saveConfig(config);
            return reply(`╭━━━〔 🔍 〕━━━┈⊷\n┃ ⋄ *Anti-Delete Enabled!*\n┃ ⋄ Mode: All Chats\n┃ ⋄ Deleted messages will be\n┃ ⋄ sent to you privately.\n┃ ⋄ \n┃ ⋄ Status: ✅ ON\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n${brand}`);
        } else if (action === 'off') {
            config.mode = "off";
            saveConfig(config);
            return reply(`╭━━━〔 🔍 〕━━━┈⊷\n┃ ⋄ *Anti-Delete Disabled!*\n┃ ⋄ \n┃ ⋄ Status: ❌ OFF\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n${brand}`);
        } else if (action === 'dm') {
            config.mode = "dm";
            config.owner = sender;
            saveConfig(config);
            return reply(`╭━━━〔 🔍 〕━━━┈⊷\n┃ ⋄ *Anti-Delete Enabled!*\n┃ ⋄ Mode: DM Alerts\n┃ ⋄ Deleted messages from any\n┃ ⋄ chat or group will be sent\n┃ ⋄ to your inbox directly.\n┃ ⋄ \n┃ ⋄ Status: ✅ ON (DM)\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n${brand}`);
        } else {
            const statusLabel = config.mode === "on" ? "✅ ON (all chats)"
                : config.mode === "dm" ? "✅ ON (alerts → your DM)"
                : "❌ OFF";
            return reply(`╭━━━〔 🔍 〕━━━┈⊷\n┃ ⋄ *ANTI-DELETE*\n┃ ⋄ \n┃ ⋄ Status: ${statusLabel}\n┃ ⋄ \n┃ ⋄ Usage:\n┃ ⋄ .antidelete on\n┃ ⋄ .antidelete off\n┃ ⋄ .antidelete dm\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n${brand}`);
        }
    },

    isAntiDeleteEnabled,
    getAntiDeleteOwner,
};
