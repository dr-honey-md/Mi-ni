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
      const BAR    = "│";
      const D      = "◇";

      // ── Command sections ──
      const sections = [
        {
          title: "ADMIN CMDS",
          cmds: [
            `.mode [privet / public]`,
            `.vv`,
            `.vv2 / ❤️`,
            `.dp`,
            `.setname [name]`,
            `.autoreacts [on/off]`,
            `.anticall [on/off]`,
            `.status [on/off/seen/like/download]`,
          ]
        },
        {
          title: "DOWNLOAD CMDS",
          cmds: [
            `${PREFIX}insta [url]`,
            `${PREFIX}tiktok [url]`,
            `${PREFIX}youtube [url]`,
            `${PREFIX}facebook [url]`,
            `${PREFIX}pinterest [url]`,
            `${PREFIX}pinterest [name]`,
            `${PREFIX}gdrive [url]`,
            `${PREFIX}mf [url]`,
            `${PREFIX}song [name]`,
            `${PREFIX}video [name]`,
            `${PREFIX}play [name]`,
            `${PREFIX}apk [name]`,
          ]
        },
        {
          title: "GROUP CMDS",
          cmds: [
            `${PREFIX}tagall`,
            `${PREFIX}hidetag`,
            `${PREFIX}groupinfo`,
            `${PREFIX}accept`,
            `${PREFIX}group / ${PREFIX}groupname [name]`,
            `${PREFIX}kickoffline [on/off]`,
            `${PREFIX}antistatus [on/off]`,
            `${PREFIX}antilink [on/off/warning/kick]`,
          ]
        },
        {
          title: "TOOLS CMDS",
          cmds: [
            `${PREFIX}trt [lang_code] [text] or reply`,
            `${PREFIX}fancy [text or style number]`,
            `${PREFIX}readmore <text>`,
            `${PREFIX}url [reply to media]`,
            `${PREFIX}runtime`,
            `${PREFIX}weather [city name]`,
          ]
        },
        {
          title: "FUN CMDS",
          cmds: [
            `${PREFIX}8ball [question]`,
            `${PREFIX}aura @user`,
            `${PREFIX}character @user`,
            `${PREFIX}choose @user1 @user2`,
            `${PREFIX}ship @user`,
            `${PREFIX}roast @user`,
          ]
        },
        {
          title: "STICKER CMDS",
          cmds: [
            `${PREFIX}s [reply to media]`,
            `${PREFIX}take [reply to sticker]`,
          ]
        },
        {
          title: "UTILITY CMDS",
          cmds: [
            `${PREFIX}menu`,
            `${PREFIX}pair`,
            `${PREFIX}vv [reply to view-once]`,
            `${PREFIX}promote @user`,
            `${PREFIX}demote @user`,
            `${PREFIX}welcome on/off`,
            `${PREFIX}goodbye on/off`,
          ]
        },
      ];

      const totalCmds = sections.reduce((a, s) => a + s.cmds.length, 0);

      // ── Build menu text ──
      let menu = "";

      menu += `╔══════[ 𝐃𝐑-𝐇𝐎𝐍𝐄𝐘-𝐌𝐈𝐍𝐈 ]══════╗\n`;
      menu += `${BAR}\n`;
      menu += `${BAR}  🤩 User: *${userName}*\n`;
      menu += `${BAR}  🤖 Status: Online ✅\n`;
      menu += `${BAR}  ⚙️ Mode: ${BOT_MODE} 🌍\n`;
      menu += `${BAR}  📦 Total Commands: *${totalCmds}*\n`;
      menu += `${BAR}  📌 Prefix: [ *${PREFIX}* ]\n`;
      menu += `${BAR}  👑 Owner: ${OWNER}\n`;
      menu += `${BAR}\n`;
      menu += `╚════════════════════════╝\n\n`;

      for (const sec of sections) {
        menu += `╭─────[ ${sec.title} ]─────•\n`;
        menu += `${BAR}\n`;
        for (const cmd of sec.cmds) {
          menu += `${BAR}  ${D} ${cmd}\n`;
        }
        menu += `${BAR}\n`;
        menu += `╰────────────────────────•\n\n`;
      }

      menu += `𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | 𝗠𝗜𝗡𝗜-𝗕𝗢𝗧\n> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`;

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
          newsletterName: "ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ",
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
