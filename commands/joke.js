const axios = require('axios');

module.exports = {
    pattern: "joke",
    desc: "Get a random joke",
    react: "😂",
    category: "fun",
    use: ".joke",
    filename: __filename,

    execute: async (conn, mek, m, { from, reply }) => {
        try {
            await conn.sendMessage(from, { react: { text: '😂', key: mek.key } });

            const response = await axios.get('https://icanhazdadjoke.com/', {
                headers: { Accept: 'application/json' }
            });
            const joke = response.data.joke;

            await conn.sendMessage(from, {
                text: `╭━━━〔 😂 *RANDOM JOKE* 〕━━━┈⊷\n┃\n┃ ${joke}\n┃\n╰━━━━━━━━━━━━━━━━━━┈⊷\n\n> 𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜 | Dr Honey TechX 💀`
            }, { quoted: mek });

        } catch (error) {
            console.error('Joke error:', error);
            await reply('❌ Could not fetch a joke right now. Try again!');
        }
    }
};
