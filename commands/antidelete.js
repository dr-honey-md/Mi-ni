const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');

function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
        return JSON.parse(fs.readFileSync(CONFIG_PATH));
    } catch { return { enabled: false }; }
}

function saveConfig(config) {
    try {
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (e) { console.error('Antidelete save error:', e); }
}

module.exports = {
    pattern: "antidelete",
    desc: "Enable/Disable anti-delete (sends deleted messages to owner)",
    react: "🔍",
    category: "owner",
    use: ".antidelete [on/off]",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, isOwner, reply }) => {
        if (!isOwner) return reply("❌ Only owner can use this command.");

        await conn.sendMessage(from, { react: { text: '🔍', key: mek.key } });

        const action = args[0]?.toLowerCase();
        const config = loadConfig();

        if (action === 'on') {
            config.enabled = true;
            saveConfig(config);
            return reply("✅ *Anti-Delete Enabled!*\nDeleted messages will be sent to you privately.\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else if (action === 'off') {
            config.enabled = false;
            saveConfig(config);
            return reply("❌ *Anti-Delete Disabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
        } else {
            return reply(`╭━━━〔 🔍 *ANTI-DELETE* 〕━━━┈⊷\n┃ Status: ${config.enabled ? '✅ ON' : '❌ OFF'}\n┃ Usage: .antidelete on/off\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`);
        }
    }
};
