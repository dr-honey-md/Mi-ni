// === owner.js ===
module.exports = {
  pattern: "owner",
  desc: "Show bot owner contact card",
  category: "info",
  react: "👑",
  filename: __filename,
  use: ".owner",

  execute: async (conn, message, m, { from, reply }) => {
    try {
      const ownerNumber = conn.user.id.split(":")[0];
      const ownerName   = process.env.OWNER_NAME || "𝐅ᴀᴍᴏᴜꜱ 𝐇ᴏɴᴇʏ";

      const vcard =
`BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
ORG:DR-HONEY-MINI;
TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}
END:VCARD`;

      await conn.sendMessage(from, {
        contacts: {
          displayName: ownerName,
          contacts: [{ vcard }]
        }
      }, { quoted: message });

    } catch (e) {
      console.error("Owner command error:", e);
      await conn.sendMessage(from, { text: "⚠️ Failed to send owner contact." }, { quoted: message });
    }
  }
};
