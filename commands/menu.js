// === menu.js ===
// DR-HONEY style menu — image banner + text, no external URL

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

      // ── React ──
      await conn.sendMessage(from, {
        react: { text: "📋", key: message.key }
      });

      // ── Config ──
      const BOT_NAME = process.env.BOT_NAME  || "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜";
      const PREFIX   = process.env.PREFIX     || ".";
      const BOT_MODE = process.env.BOT_MODE   || "Public";
      const OWNER    = process.env.OWNER_NAME || "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬";
      const CHANNEL  = process.env.CHANNEL_JIDS
        ? process.env.CHANNEL_JIDS.split(",")[0]
        : "120363403964756123@newsletter";

      // ── Sender name ──
      const userName = message.pushName || "User";

      // ── Border helpers ──
      const TOP    = (t) => `╭──────────[ ${t} ]──────────•`;
      const BOT_LN =       `╰──────────────────────────────•`;
      const BAR    = "│";
      const D      = "◇";

      // ── Command sections ──
      const sections = [
        {
          title: "ADMIN CMDS",
          cmds: [
            `${PREFIX}mode [public / private]`,
            `${PREFIX}vv`,
            `${PREFIX}vv2 / ❤️`,
            `${PREFIX}dp`,
            `${PREFIX}setname [name]`,
            `${PREFIX}autoreacts [on/off]`,
            `${PREFIX}anticall [on/off]`,
            `${PREFIX}status [on/off/seen/like/download]`,
            `${PREFIX}prefix [symbol]`,
          ]
        },
        {
          title: "DOWNLOAD CMDS",
          cmds: [
            `${PREFIX}tiktok [url]`,
            `${PREFIX}ytmp3 [url]`,
            `${PREFIX}ytmp4 [url]`,
            `${PREFIX}pinterest [url]`,
            `${PREFIX}pinterest [name]`,
            `${PREFIX}play [name]`,
            `${PREFIX}url  [reply to media]`,
          ]
        },
        {
          title: "GROUP CMDS",
          cmds: [
            `${PREFIX}welcome [on/off]`,
            `${PREFIX}goodbye [on/off]`,
            `${PREFIX}hidetag [message]`,
            `${PREFIX}tagall`,
            `${PREFIX}promote [@user]`,
            `${PREFIX}demote [@user]`,
          ]
        },
        {
          title: "FUN & TOOLS",
          cmds: [
            `${PREFIX}roast [@user]`,
            `${PREFIX}ship [@user]`,
            `${PREFIX}aura [@user]`,
            `${PREFIX}8ball [question]`,
            `${PREFIX}choose`,
            `${PREFIX}character [@user]`,
            `${PREFIX}fancy [text]`,
            `${PREFIX}sticker / ${PREFIX}s`,
            `${PREFIX}take [reply sticker]`,
            `${PREFIX}trt [lang] [text]`,
            `${PREFIX}weather [city]`,
            `${PREFIX}readmore [text]`,
            `${PREFIX}runtime`,
            `${PREFIX}ping`,
            `${PREFIX}pair`,
          ]
        },
      ];

      const totalCmds = sections.reduce((a, s) => a + s.cmds.length, 0);

      // ── Build menu text ──
      let menu = "";

      menu += TOP(`${BOT_NAME} 💀`) + "\n";
      menu += `${BAR}\n`;
      menu += `${BAR}  👤 User: ${userName}\n`;
      menu += `${BAR}  🤖 status: Online ✅\n`;
      menu += `${BAR}  ⚙️ Mode: ${BOT_MODE} 🌍\n`;
      menu += `${BAR}  📜 Command: ${totalCmds}\n`;
      menu += `${BAR}  🔑 Prefix: [ ${PREFIX} ]\n`;
      menu += `${BAR}  👑 Owner: ${OWNER}\n`;
      menu += `${BAR}\n`;
      menu += BOT_LN + "\n\n";

      for (const sec of sections) {
        menu += TOP(sec.title) + "\n";
        menu += `${BAR}\n`;
        for (const cmd of sec.cmds) {
          menu += `${BAR}  ${D} ${cmd}\n`;
        }
        menu += `${BAR}\n`;
        menu += BOT_LN + "\n\n";
      }

      menu += `> 💀 *${BOT_NAME}* | *DR HONEY TECHX*`;

      // ── Load banner image as buffer ──
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

      // ── Send: image + caption if banner exists, else text only ──
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
