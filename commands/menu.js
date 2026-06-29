// === menu.js — Fully Dynamic (auto-reads commands folder) ===
const fs   = require("fs");
const path = require("path");
const { getMode } = require("../lib/botMode");

// ── Category emoji map ─────────────────────────────────────────────────────
// Naya category add karne ki zaroorat nahi — unknown categories
// automatically 🔹 icon ke saath show hongi.
const CAT_ICONS = {
  admin:     "👑",
  owner:     "🔑",
  group:     "👥",
  utility:   "🛠️",
  fun:       "😄",
  sticker:   "🖼️",
  media:     "🎬",
  music:     "🎵",
  download:  "📥",
  convert:   "🔄",
  tools:     "🔧",
  info:      "ℹ️",
  other:     "🔮",
};

// ── Category order (known categories pehle, baad me unknown alphabetically) ─
const CAT_ORDER = [
  "admin",
  "owner",
  "group",
  "utility",
  "fun",
  "sticker",
  "media",
  "music",
  "download",
  "convert",
  "tools",
  "info",
  "other",
];

// ── Build grouped command list fresh from disk each time ───────────────────
function loadDynamicCommands() {
  const cmdsPath = path.join(__dirname);
  const grouped  = {};
  const seen     = new Set();

  const files = fs.readdirSync(cmdsPath).filter(f => f.endsWith(".js"));

  for (const file of files) {
    try {
      // Clear require cache so hot-added files are picked up instantly
      const filePath = path.join(cmdsPath, file);
      delete require.cache[require.resolve(filePath)];
      const mod = require(filePath);

      const addCmd = (m, sourceFile) => {
        if (!m || !m.pattern || !m.execute) return;
        if (seen.has(m.pattern)) return;
        seen.add(m.pattern);

        // Normalize category names
        let cat;
        if (m.category && m.category.trim() !== "") {
          cat = m.category.toLowerCase().trim();
        } else {
          // Category nahi di — file name se category banao
          cat = path.basename(sourceFile, ".js").toLowerCase().trim();
        }

        if (cat === "downloader") cat = "download";   // alias fix
        if (cat === "utilities")  cat = "utility";    // alias fix
        if (cat === "groups")     cat = "group";      // alias fix
        if (cat === "musics")     cat = "music";      // alias fix
        if (cat === "medias")     cat = "media";      // alias fix
        if (cat === "stickers")   cat = "sticker";    // alias fix

        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push({
          pattern: m.pattern,
          desc:    m.desc || "",
          use:     m.use  || "",
          alias:   m.alias || [],
        });
      };

      if (mod.pattern && mod.execute) {
        addCmd(mod, file);
      } else {
        // Multi-export file (multiple commands in one file)
        for (const val of Object.values(mod)) {
          if (val && val.pattern) addCmd(val, file);
        }
      }
    } catch (e) {
      console.error(`menu.js: failed to load ${file}:`, e.message);
    }
  }

  // Sort commands alphabetically inside each category
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.pattern.localeCompare(b.pattern));
  }

  return grouped;
}

// ── Sort categories: known order first, then unknown alphabetically ─────────
function sortCategories(grouped) {
  const known   = CAT_ORDER.filter(c => grouped[c]);
  const unknown = Object.keys(grouped)
    .filter(c => !CAT_ORDER.includes(c))
    .sort();
  return [...known, ...unknown];
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
      const liveMode  = getMode();
      const BOT_MODE  = liveMode === 'private' ? 'Private' : 'Public';
      const MODE_EMOJI = liveMode === 'private' ? '🔐' : '🌍';
      const OWNER    = process.env.OWNER_NAME || "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬";
      const userName = message.pushName || "User";

      const CHANNEL_JID = process.env.CHANNEL_JIDS
        ? process.env.CHANNEL_JIDS.split(",")[0]
        : "120363403964756123@newsletter";

      const channelUrl = `https://whatsapp.com/channel/${CHANNEL_JID.replace("@newsletter", "")}`;

      // ── Load commands dynamically ──────────────────────────────────────
      const grouped   = loadDynamicCommands();
      const allCats   = sortCategories(grouped);
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
      menu += `${BAR} ⚙️ *Mode*: ${BOT_MODE} ${MODE_EMOJI}\n`;
      menu += `${BAR} 📜 *Commands*: ${totalCmds}\n`;
      menu += `${BAR} 👑 *Owner*: ${OWNER}\n`;
      menu += `${BAR}\n`;
      menu += BOT_LN + "\n\n";

      // ── Sections — auto-generated per category ─────────────────────────
      for (const cat of allCats) {
        const icon  = CAT_ICONS[cat] || "🔹";   // unknown category → 🔹
        const title = `${icon} ${cat.toUpperCase()}`;
        menu += TOP(title) + "\n";

        for (const cmd of grouped[cat]) {
          menu += `${BAR} ${D} *${PREFIX}${cmd.pattern}*\n`;
        }

        menu += BOT_LN + "\n\n";
      }

      menu += `> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ\n> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`;

      // ── Load banner ────────────────────────────────────────────────────
      const bannerPath  = path.join(__dirname, "../public/menu-banner.jpg");
      const imageBuffer = fs.existsSync(bannerPath) ? fs.readFileSync(bannerPath) : null;

      const ctx = {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid:   CHANNEL_JID,
          newsletterName:  `Dr Honey TechX 💀`,
          serverMessageId: 200
        }
      };

      // ── View Channel button ────────────────────────────────────────────
      const templateButtons = [
        {
          index: 1,
          urlButton: {
            displayText: "📢 View Channel",
            url: channelUrl
          }
        }
      ];

      if (imageBuffer) {
        await conn.sendMessage(from, {
          image: imageBuffer,
          caption: menu,
          mimetype: "image/jpeg",
          fileName: `Dr Honey TechX 💀`,
          contextInfo: ctx,
          templateButtons
        }, { quoted: message });
      } else {
        await conn.sendMessage(from, {
          text: menu,
          contextInfo: ctx,
          templateButtons
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
