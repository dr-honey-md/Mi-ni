module.exports = {
    pattern: "ai",
    desc: "Ask AI a question or toggle AI auto-reply",
    react: "🤖",
    category: "utility",
    use: ".ai [on/off] or .ai <question>",
    filename: __filename,

    execute: async (conn, mek, m, { from, args, q, isOwner, reply }) => {
        try {
            await conn.sendMessage(from, { react: { text: "🤖", key: mek.key } });

            if (!isOwner) return reply("❌ Only owner can use this command.");

            const action = args[0]?.toLowerCase();

            if (action === 'on') {
                return reply("✅ *AI Auto-Reply Enabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
            } else if (action === 'off') {
                return reply("❌ *AI Auto-Reply Disabled!*\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
            } else if (q) {
                const axios = require('axios');
                const res = await axios.get(`https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(q)}`);
                const answer = res.data?.result || "❌ No response from AI.";
                return reply(`🤖 *AI Response:*\n\n${answer}\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`);
            } else {
                return reply("❌ *Usage:*\n`.ai on/off` — Toggle Auto-Reply\n`.ai <question>` — Ask AI\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀");
            }
        } catch (e) {
            console.error("AI Command Error:", e.message);
            await reply("❌ AI Error: " + e.message);
        }
    }
};
