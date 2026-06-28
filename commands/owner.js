// === owner.js ===
module.exports = {
  pattern: "owner",
  desc: "Show bot owner info and contact link",
  category: "info",
  react: "👑",
  filename: __filename,
  use: ".owner",

  execute: async (conn, message, m, { from, reply }) => {
    try {
      // React first
      await conn.sendMessage(from, {
        react: { text: "👑", key: message.key }
      });

      // Build owner number from bot JID (bot is owned by the logged-in number)
      const ownerNumber = conn.user.id.split(":")[0];
      const ownerJid = `${ownerNumber}@s.whatsapp.net`;

      const ownerText = `👑 *Bot Owner Info*

📛 Name  : 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜
📱 Number: +${ownerNumber}
🤖 Bot   : 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜

_Tap the number above to open a chat with the owner._`;

      const isNewsletter = from.endsWith("@newsletter");

      if (isNewsletter) {
        await conn.sendMessage(
          from,
          {
            text: ownerText,
            mentions: [ownerJid],
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363403964756123@newsletter",
                newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
                serverMessageId: 200
              }
            }
          },
          { quoted: message }
        );
      } else {
        await conn.sendMessage(
          from,
          {
            text: ownerText,
            mentions: [ownerJid],
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363403964756123@newsletter",
                newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
                serverMessageId: 200
              },
              externalAdReply: {
                title: "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 Owner",
                body: `Contact: +${ownerNumber}`,
                thumbnailUrl: "https://up6.cc/2026/06/17818425609981.jpg",
                sourceUrl: `https://wa.me/${ownerNumber}`,
                mediaType: 1,
                renderLargerThumbnail: true
              }
            }
          },
          { quoted: message }
        );
      }
    } catch (e) {
      console.error("Owner command error:", e);

      await conn.sendMessage(from, {
        react: { text: "❌", key: message.key }
      });

      await conn.sendMessage(
        from,
        {
          text: "⚠️ Failed to fetch owner info.",
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "120363403964756123@newsletter",
              newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
              serverMessageId: 200
            }
          }
        },
        { quoted: message }
      );
    }
  }
};
