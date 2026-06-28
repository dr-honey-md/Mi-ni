function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    pattern: "hack",
    desc: "Fake hack animation (just for fun!)",
    react: "💻",
    category: "fun",
    use: ".hack <name or number>",
    filename: __filename,

    execute: async (conn, mek, m, { from, q, isOwner, reply }) => {
        if (!isOwner) return reply('❌ Only the bot owner can use this command.');

        const target = q || "Target";

        try {
            await conn.sendMessage(from, { react: { text: '💻', key: mek.key } });

            const steps = [
                `💻 *HACK STARTING...* 💻\n🎯 Target: *${target}*`,
                '*Initializing hacking tools...* 🛠️',
                '*Connecting to remote servers...* 🌐',
                '```[█▒▒▒▒] 10%``` ⏳',
                '```[██▒▒▒▒] 30%``` ⏳',
                '```[████▒▒▒] 50%``` ⏳',
                '```[██████▒] 70%``` ⏳',
                '```[████████] 90%``` ⏳',
                '```[████████] 100%``` ✅',
                '🔒 *System Breach: Successful!* 🔓',
                '🚀 *Executing final commands...* 🎯',
                '*📡 Transmitting data...* 📤',
                '_🕵️‍♂️ Covering tracks..._ 🤫',
                '*🔧 Finalizing operations...* 🏁',
                '⚠️ *Note:* This is a joke command for fun only 😄',
                `> *HACK COMPLETE ☣*\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            ];

            for (const line of steps) {
                await conn.sendMessage(from, { text: line }, { quoted: mek });
                const delay = Math.floor(Math.random() * 1200) + 500;
                await sleep(delay);
            }
        } catch (err) {
            console.error('hackCommand error:', err);
            await reply(`❌ Error: ${err.message}`);
        }
    }
};
