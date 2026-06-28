// === runtime.js ===
const startTime = Date.now();

function getUptime() {
  const uptime = Date.now() - startTime;
  const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, totalMs: uptime };
}

function getRuntimeCommand() {
  return {
    pattern: "runtime",
    category: "utility",   // FIX: was "tags: ['utility']" — wrong key, menu.js uses category
    desc: "Show bot uptime",
    react: "🕐",
    filename: __filename,
    use: ".runtime",

    execute: async (conn, message, m, { from, reply }) => {  // FIX: signature now matches server.js call (conn, message, m, {...})
      try {
        const uptime = getUptime();
        const runtimeText = `🕐 *Runtime Information*

⏱️ Uptime: ${uptime.days}d ${uptime.hours}h ${uptime.minutes}m ${uptime.seconds}s
🚀 Started: ${new Date(startTime).toLocaleString()}
📊 Total: ${uptime.totalMs} milliseconds

> *ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ*
> *© ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx*`;

        // React first
        await conn.sendMessage(from, {
          react: { text: "🕐", key: message.key }
        });

        // Send banner image
        await conn.sendMessage(from, {
          image: { url: "https://up6.cc/2026/06/17818425609981.jpg" },
          caption: ""
        }, { quoted: message });

        // Check if it's a newsletter context
        const isNewsletter = from.endsWith('@newsletter');

        if (isNewsletter) {
          await conn.sendMessage(from, {
            text: runtimeText,
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363403964756123@newsletter",
                newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
                serverMessageId: 147
              }
            }
          }, { quoted: message });
        } else {
          await conn.sendMessage(from, {
            text: runtimeText,
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363403964756123@newsletter",
                newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
                serverMessageId: 147
              },
              externalAdReply: {
                title: "DR-HONEY-MINI RUNTIME",
                body: "DR-HONEY-MINI RUNTIME",
                thumbnailUrl: "https://up6.cc/2026/06/17818425609981.jpg",
                mediaType: 1,
                renderLargerThumbnail: true
              }
            }
          }, { quoted: message });
        }

      } catch (e) {
        console.error("Runtime error:", e);

        await conn.sendMessage(from, {
          react: { text: "❌", key: message.key }  // FIX: was "?" (broken emoji literal)
        });

        const isNewsletter = from.endsWith('@newsletter');

        if (isNewsletter) {
          await conn.sendMessage(from, {
            text: "⚠️ Failed to fetch runtime info.",
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363403964756123@newsletter",
                newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
                serverMessageId: 148
              }
            }
          }, { quoted: message });
        } else {
          await conn.sendMessage(from, {
            text: "⚠️ Failed to fetch runtime info.",
            contextInfo: {
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: "120363403964756123@newsletter",
                newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
                serverMessageId: 148
              },
              externalAdReply: {
                title: "❌ Error",
                body: "Failed to fetch runtime information",
                thumbnailUrl: "https://up6.cc/2026/06/17818425609981.jpg",
                mediaType: 1,
                renderLargerThumbnail: true
              }
            }
          }, { quoted: message });
        }
      }
    }
  };
}

module.exports = {
  getUptime,
  getRuntimeCommand
};
