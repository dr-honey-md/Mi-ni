// === menu.js ===
// DR-HONEY style menu — Screenshot style

const fs   = require("fs");
const path = require("path");

module.exports = {
  pattern: "menu",
  desc: "Show all bot commands",
  category: "utility",
  react: "📋",
  filename: __filename,
  use: ".menu",

  execute: async (conn, message, m, { from, reply, sender }) => {
    try {

      await conn.sendMessage(from, {
        react: { text: "📋", key: message.key }
      });

      const BOT_NAME = process.env.BOT_NAME  || "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜";
      const PREFIX   = process.env.PREFIX     || ".";
      const BOT_MODE = process.env.BOT_MODE   || "Public";
      const OWNER    = process.env.OWNER_NAME || "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬";
      const CHANNEL  = process.env.CHANNEL_JIDS
        ? process.env.CHANNEL_JIDS.split(",")[0]
        : "120363403964756123@newsletter";

      const userName = message.pushName || "User";

      // ── Screenshot style border helpers ──
      const TOP    = (t) => `┌──────{ ${t} }──────•`;
      const BOT_LN =        `└─────────────────────────────•`;
      const BAR    = "│";
      const D      = "◇";

      // ── Sections ──
      const sections = [
        {
          title: "🔄 CONVERT",
          cmds: [
            { cmd: `${PREFIX}readmore <text>`,         desc: "Generate a Read More message" },
          ]
        },
        {
          title: "📥 DOWNLOAD",
          cmds: [
            { cmd: `${PREFIX}pinterest [url/name]`,    desc: "Download media from Pinterest" },
            { cmd: `${PREFIX}tiktok <link>`,           desc: "Download TikTok video without watermark" },
            { cmd: `${PREFIX}ytmp4 [url]`,             desc: "Download YouTube video in MP4 format" },
          ]
        },
        {
          title: "😄 FUN",
          cmds: [
            { cmd: `${PREFIX}8ball [question]`,        desc: "Magic 8-Ball gives answers" },
            { cmd: `${PREFIX}aura @user OR reply`,     desc: "Calculate aura score of a user" },
            { cmd: `${PREFIX}character @user OR reply`,desc: "Describe a user's character" },
            { cmd: `${PREFIX}choose @user1 @user2`,    desc: "Randomly chooses one mentioned user" },
            { cmd: `${PREFIX}fancy <text or style n>`, desc: "Convert text into various fonts" },
            { cmd: `${PREFIX}ship @user OR reply`,     desc: "Pairs the command user with another member" },
          ]
        },
        {
          title: "👥 GROUP",
          cmds: [
            { cmd: `${PREFIX}demote @user OR reply`,   desc: "Demote an admin to member (Admin/Owner Only)" },
            { cmd: `${PREFIX}goodbye on/off`,          desc: "Toggle goodbye messages for this group" },
            { cmd: `${PREFIX}hidetag [message]`,       desc: "Tag all members for any message/media" },
            { cmd: `${PREFIX}promote @user OR reply`,  desc: "Promote a user to admin (Admin/Owner Only)" },
            { cmd: `${PREFIX}welcome on/off`,          desc: "Toggle welcome messages for this group" },
          ]
        },
        {
          title: "🎵 MUSIC",
          cmds: [
            { cmd: `${PREFIX}play [name]`,             desc: "Search and download Spotify/YouTube tracks" },
          ]
        },
        {
          title: "🔮 OTHER",
          cmds: [
            { cmd: `${PREFIX}runtime`,                 desc: "Show bot uptime" },
            { cmd: `${PREFIX}weather [city name]`,     desc: "Get weather information for a location" },
          ]
        },
        {
          title: "🖼️ STICKER",
          cmds: [
            { cmd: `${PREFIX}s <reply to media>`,      desc: "Convert media to sticker" },
            { cmd: `${PREFIX}take <reply to media>`,   desc: "Convert media to sticker with custom author" },
          ]
        },
        {
          title: "🔧 TOOLS",
          cmds: [
            { cmd: `${PREFIX}trt [lang] [text]`,       desc: "Translate text to specified language" },
          ]
        },
        {
          title: "🛠️ UTILITY",
          cmds: [
            { cmd: `${PREFIX}menu`,                    desc: "Show all bot commands" },
            { cmd: `${PREFIX}pair`,                    desc: "Connect your WhatsApp to bot" },
            { cmd: `${PREFIX}url [reply to media]`,    desc: "Convert media to Catbox URL" },
            { cmd: `${PREFIX}vv <reply to view-once>`, desc: "Open view-once image, video or audio" },
          ]
        },
      ];

      const totalCmds = sections.reduce((a, s) => a + s.cmds.length, 0);

      // ── Build menu text (Screenshot style) ──
      let menu = "";

      menu += `┌──────{ ${BOT_NAME} 💀 }──────•\n`;
      menu += `${BAR}\n`;
      menu += `${BAR} 👤 User: ${userName}\n`;
      menu += `${BAR} 🤖 status: Online ✅\n`;
      menu += `${BAR} ⚙️ Mode: ${BOT_MODE} 🌍\n`;
      menu += `${BAR} 📜 Command: ${totalCmds}\n`;
      menu += `${BAR}\n`;
      menu += BOT_LN + "\n\n";

      for (const sec of sections) {
        menu += TOP(sec.title) + "\n";
        for (const item of sec.cmds) {
          menu += `${BAR} ${D} *${item.cmd}*\n`;
        }
        menu += BOT_LN + "\n\n";
      }

      menu += `> 💀 *${BOT_NAME}* | *DR HONEY TECHX*`;

      // ── Load banner if exists ──
      const bannerPath = path.join(__dirname, "../public/menu-banner.jpg");
      const imageBuffer = fs.existsSync(bannerPath)
        ? fs.readFileSync(bannerPath)
        : null;

      const ctxInfo = {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: CHANNEL,
          newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
          serverMessageId: 200
        }
      };

      if (imageBuffer) {
        await conn.sendMessage(from, {
          image: imageBuffer,
          caption: menu,
          mimetype: "image/jpeg",
          contextInfo: ctxInfo
        }, { quoted: message });
      } else {
        await conn.sendMessage(from, {
          text: menu,
          contextInfo: ctxInfo
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
