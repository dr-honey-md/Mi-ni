// === menu.js — Fully Dynamic (auto-reads commands folder) ===
const fs   = require("fs");
const path = require("path");

// Category emoji map — add new categories here if needed
const CAT_ICONS = {
  utility:   "🛠️",
  tools:     "🔧",
  group:     "👥",
  fun:       "😄",
  sticker:   "🖼️",
  download:  "📥",
  convert:   "🔄",
  music:     "🎵",
  media:     "🎬",
  info:      "ℹ️",
  admin:     "👑",
  owner:     "🔑",
  other:     "🔮",
};

// Build grouped command list fresh from disk each time
function loadDynamicCommands() {
  const cmdsPath = path.join(__dirname);
  const grouped  = {};
  const seen     = new Set();

  const files = fs.readdirSync(cmdsPath).filter(f => f.endsWith(".js"));

  for (const file of files) {
    try {
      // Clear require cache so hot-added files are picked up
      const filePath = path.join(cmdsPath, file);
      delete require.cache[require.resolve(filePath)];
      const mod = require(filePath);

      const addCmd = (m) => {
        if (!m || !m.pattern || !m.execute) return;
        if (seen.has(m.pattern)) return;
        seen.add(m.pattern);

        const cat = (m.category || "other").toLowerCase();
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({
          pattern: m.pattern,
          desc:    m.desc || "",
          use:     m.use  || "",
          alias:   m.alias || [],
        });
      };

      if (mod.pattern && mod.execute) {
        addCmd(mod);
      } else {
        // Multi-export file
        for (const val of Object.values(mod)) {
          if (val && val.pattern) addCmd(val);
        }
      }
    } catch (e) {
      console.error(`menu.js: failed to load ${file}:`, e.message);
    }
  }

  // Sort commands inside each category
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.pattern.localeCompare(b.pattern));
  }

  return grouped;
}

module.exports = {
  pattern:  "menu",
  desc:     "Show all bot commands (auto-updated)",
  category: "utility",
  react:    "📋",
  filename: __filename,
  use:      ".menu",

  execute: async (conn, message, m, { from, reply, sender }) => {
    try {
      await conn.sendMessage(from, {
        react: { text: "📋", key: message.key }
      });

      const BOT_NAME = process.env.BOT_NAME  || "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜";
      const PREFIX   = process.env.PREFIX     || ".";
      const BOT_MODE = process.env.BOT_MODE   || "Public";
      const OWNER    = process.env.OWNER_NAME || "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬";
      const userName = message.pushName || "User";

      // ── Load commands dynamically ──────────────────────────────────────
      const grouped   = loadDynamicCommands();
      const allCats   = Object.keys(grouped).sort();
      const totalCmds = allCats.reduce((acc, c) => acc + grouped[c].length, 0);

      // ── Border helpers ─────────────────────────────────────────────────
      const TOP    = (t) => `╭━━━〔 *${t}* 〕━━━┈⊷`;
      const BOT_LN = `╰━━━━━━━━━━━━━━━━━━┈⊷`;
      const BAR    = "┃";
      const D      = "⋄";

      // ── Header ─────────────────────────────────────────────────────────
      let menu = "";
      menu += `╭━━━〔 *${BOT_NAME} 💀* 〕━━━┈⊷\n`;
      menu += `${BAR}\n`;
      menu += `${BAR} 👤 *User*: ${userName}\n`;
      menu += `${BAR} 🤖 *Status*: Online ✅\n`;
      menu += `${BAR} ⚙️ *Mode*: ${BOT_MODE} 🌍\n`;
      menu += `${BAR} 📜 *Commands*: ${totalCmds}\n`;
      menu += `${BAR} 👑 *Owner*: ${OWNER}\n`;
      menu += `${BAR}\n`;
      menu += BOT_LN + "\n\n";

      // ── Sections (auto-generated per category) ─────────────────────────
      for (const cat of allCats) {
        const icon  = CAT_ICONS[cat] || "🔹";
        const title = `${icon} ${cat.toUpperCase()}`;
        menu += TOP(title) + "\n";

        for (const cmd of grouped[cat]) {
          const useText = cmd.use
            ? cmd.use.replace(/^\.?\w+\s*/, "").trim() // strip command prefix from use
            : "";
          menu += `${BAR} ${D} *${PREFIX}${cmd.pattern}*${useText ? " " + useText : ""}\n`;
          if (cmd.desc) {
            menu += `${BAR}   ↳ ${cmd.desc}\n`;
          }
          // Show aliases if any
          if (cmd.alias && cmd.alias.length > 0) {
            menu += `${BAR}   ≡ Alias: ${cmd.alias.map(a => PREFIX + a).join(", ")}\n`;
          }
        }

        menu += BOT_LN + "\n\n";
      }

      menu += `> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ\n> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`;

      // ── Load banner ────────────────────────────────────────────────────
      const bannerPath  = path.join(__dirname, "../public/menu-banner.jpg");
      const imageBuffer = fs.existsSync(bannerPath) ? fs.readFileSync(bannerPath) : null;

      const CHANNEL_JID = process.env.CHANNEL_JIDS
        ? process.env.CHANNEL_JIDS.split(",")[0]
        : "120363403964756123@newsletter";

      const ctx = {
        externalAdReply: {
          title: `DR HONEY TECHX 💀`,
          body:  `© ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`,
          mediaType: 1,
          renderLargerThumbnail: false,
          showAdAttribution: true,
          containsAutoReply: true,
          sourceUrl: `https://whatsapp.com/channel/${CHANNEL_JID.replace("@newsletter", "")}`,
        },
        forwardedNewsletterMessageInfo: {
          newsletterJid:   CHANNEL_JID,
          newsletterName:  `📢 DR HONEY TECHX`,
          serverMessageId: 200
        }
      };

      if (imageBuffer) {
        await conn.sendMessage(from, {
          image: imageBuffer,
          caption: menu,
          mimetype: "image/jpeg",
          fileName: `Dr Honey TechX 💀`,
          contextInfo: ctx
        }, { quoted: message });
      } else {
        await conn.sendMessage(from, {
          text: menu,
          contextInfo: ctx
        }, { quoted: message });
      }

    } catch (e) {
      console.error("Menu error:", e);
      await conn.sendMessage(message.key.remoteJid, {
        react: { text: "❌", key: message.key }
      });
    }
  }
};
