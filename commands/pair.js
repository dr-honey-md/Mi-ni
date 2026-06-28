const axios = require("axios");

// Local URL of this same server's /api/pair endpoint (defined in server.js).
// Override with PAIR_API_URL env var if the bot runs behind a different host/port.
const PAIR_API_URL = process.env.PAIR_API_URL || `http://localhost:${process.env.PORT || 3000}/api/pair`;

module.exports = {
    pattern: "pair",
    desc: "Generate a real WhatsApp pairing code for 𝗠𝗔𝗡𝗖𝗗-𝟬𝟱-𝗠𝗙",
    react: "💓",
    category: "utility",
    use: ".pair <number with country code>",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, q, reply }) => {
        // Helper function to send messages with contextInfo
        const sendMessageWithContext = async (text, quoted = mek) => {
            return await conn.sendMessage(from, {
                text: text,
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363403964756123@newsletter",
                        newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
                        serverMessageId: 200
                    }
                }
            }, { quoted: quoted });
        };

        try {
            // React with key emoji
            if (module.exports.react) {
                await conn.sendMessage(from, { react: { text: module.exports.react, key: mek.key } });
            }

            // Number can come from args (e.g. ".pair 923001234567") or from quoted text (q)
            const rawNumber = (args && args[0]) || q || "";
            const number = rawNumber.replace(/\D/g, ""); // keep digits only

            if (!number || number.length < 8) {
                return await sendMessageWithContext(
                    `⚠️ *Number missing or invalid!*\n\n` +
                    `📋 *Usage:* .pair <number with country code>\n` +
                    `💡 *Example:* .pair 923001234567\n\n` +
                    `Don't use "+", spaces, or brackets — just country code + number.`
                );
            }

            await sendMessageWithContext(`⏳ Generating pairing code for *${number}*... please wait.`);

            // Call this server's own /api/pair endpoint to get a real pairing code
            const { data } = await axios.post(
                PAIR_API_URL,
                { number },
                { timeout: 30000 }
            );

            if (!data || !data.success || !data.pairingCode) {
                throw new Error(data?.error || data?.details || "No pairing code returned");
            }

            // Format code as XXXX-XXXX for readability, like WhatsApp shows it
            const code = data.pairingCode;
            const formattedCode = code.length === 8
                ? `${code.slice(0, 4)}-${code.slice(4)}`
                : code;

            const pairingMessage = `╔══════[ 𝐃𝐑-𝐇𝐎𝐍𝐄𝐘-𝐌𝐈𝐍𝐈 ]══════╗\n` +
                                `  ◇ 📱 Number : ${number}\n` +
                                `  ◇ 🔢 Code : ${formattedCode}\n` +
                                `  ◇ ⏱️ Expires : in a few minutes\n` +
                                `  ◇ 🔗 Link : Settings → Linked Devices\n` +
                                `  ◇ 💡 Type ${formattedCode} when prompted\n` +
                                `╚════════════════════════╝\n\n` +
                                `╔══════[ 𝐏𝐀𝐈𝐑𝐈𝐍𝐆 𝐆𝐔𝐈𝐃𝐄 ]══════╗\n` +
                                `  ◇ 1️⃣ Open WhatsApp on ${number}\n` +
                                `  ◇ 2️⃣ Tap Settings → Linked Devices\n` +
                                `  ◇ 3️⃣ Tap "Link a Device"\n` +
                                `  ◇ 4️⃣ Tap "Link with phone number instead"\n` +
                                `  ◇ 5️⃣ Enter code: ${formattedCode}\n` +
                                `╚════════════════════════╝\n\n` +
                                `╔══════[ ⚠️ ɴᴏᴛᴇ ]══════╗\n` +
                                `  ◇ 🔒 Never share this code with anyone\n` +
                                `  ◇ 🔁 Expired? Send ${process.env.PREFIX || "."}pair ${number} again\n` +
                                `  ◇ 📢 Support : 𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 channel\n` +
                                `╚════════════════════════╝\n\n` +
                                `> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ\n` +
                                `> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`;

            await sendMessageWithContext(pairingMessage);

        } catch (e) {
            const errMsg = e.response?.data?.error || e.response?.data?.details || e.message;
            console.error("❌ Pair Command Error:", errMsg);
            await sendMessageWithContext(`⚠️ *Error generating pairing code:*\n${errMsg}`);
        }
    }
};
