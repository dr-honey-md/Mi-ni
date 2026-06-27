const express = require("express");
const http = require("http");
require("dotenv").config();
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const { useMultiFileAuthState, makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require("@whiskeysockets/baileys");
const P = require("pino");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

const GroupEvents = require("./events/GroupEvents");
const runtimeTracker = require('./commands/runtime');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Store active connections
const activeConnections = new Map();
const pairingCodes = new Map();
const userPrefixes = new Map();

// Command usage stats (in-memory + persistent)
const commandStats = new Map();
const CMD_STATS_FILE = path.join(__dirname, 'command-stats.json');

function loadCommandStats() {
    try {
        if (fs.existsSync(CMD_STATS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CMD_STATS_FILE, 'utf8'));
            for (const [cmd, count] of Object.entries(data)) {
                commandStats.set(cmd, count);
            }
            console.log(`📊 Loaded command stats: ${commandStats.size} commands`);
        }
    } catch(e) { console.error('❌ Error loading command stats:', e); }
}

function saveCommandStats() {
    try {
        const data = Object.fromEntries(commandStats);
        fs.writeFileSync(CMD_STATS_FILE, JSON.stringify(data, null, 2));
    } catch(e) { console.error('❌ Error saving command stats:', e); }
}

function trackCommandUsage(commandName) {
    const current = commandStats.get(commandName) || 0;
    commandStats.set(commandName, current + 1);
}

loadCommandStats();
setInterval(saveCommandStats, 30000);

// Store status media for forwarding
const statusMediaStore = new Map();

let activeSockets = 0;
let totalUsers = 0;

// Login attempts tracker (in-memory, last 50)
const loginAttempts = [];

// Banned users & IPs
const BANNED_FILE = path.join(__dirname, 'banned-data.json');
let bannedUsers = [];
let bannedIps = [];

function loadBannedData() {
    try {
        if (fs.existsSync(BANNED_FILE)) {
            const d = JSON.parse(fs.readFileSync(BANNED_FILE, 'utf8'));
            bannedUsers = d.users || [];
            bannedIps   = d.ips   || [];
        }
    } catch(e) {}
}
function saveBannedData() {
    try { fs.writeFileSync(BANNED_FILE, JSON.stringify({ users: bannedUsers, ips: bannedIps }, null, 2)); } catch(e) {}
}
loadBannedData();

// Message counter
const MSG_COUNTER_FILE = path.join(__dirname, 'msg-counter.json');
let msgCounterData = { today: 0, week: 0, lastDate: '' };

function loadMsgCounter() {
    try {
        if (fs.existsSync(MSG_COUNTER_FILE)) {
            msgCounterData = JSON.parse(fs.readFileSync(MSG_COUNTER_FILE, 'utf8'));
        }
    } catch(e) {}
}
function saveMsgCounter() {
    try { fs.writeFileSync(MSG_COUNTER_FILE, JSON.stringify(msgCounterData, null, 2)); } catch(e) {}
}
function incrementMsgCounter() {
    const today = new Date().toISOString().slice(0, 10);
    if (msgCounterData.lastDate !== today) {
        // New day: reset daily but keep weekly rolling
        msgCounterData.today = 0;
        msgCounterData.lastDate = today;
    }
    msgCounterData.today++;
    msgCounterData.week++;
    saveMsgCounter();
}
loadMsgCounter();

// Persistent data file path
const DATA_FILE = path.join(__dirname, 'persistent-data.json');

// Load persistent data
function loadPersistentData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            totalUsers = data.totalUsers || 0;
            console.log(`📊 Loaded persistent data: ${totalUsers} total users`);
        } else {
            console.log("📊 No existing persistent data found, starting fresh");
            savePersistentData(); // Create initial file
        }
    } catch (error) {
        console.error("❌ Error loading persistent data:", error);
        totalUsers = 0;
    }
}

// Save persistent data
function savePersistentData() {
    try {
        const data = {
            totalUsers: totalUsers,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`💾 Saved persistent data: ${totalUsers} total users`);
    } catch (error) {
        console.error("❌ Error saving persistent data:", error);
    }
}

// Initialize persistent data
loadPersistentData();

// Auto-save persistent data every 30 seconds
setInterval(() => {
    savePersistentData();
}, 30000);

// Stats broadcasting helper
function broadcastStats() {
    io.emit("statsUpdate", { activeSockets, totalUsers });
}

// Track frontend connections (stats dashboard)
io.on("connection", (socket) => {
    console.log("📊 Frontend connected for stats");
    socket.emit("statsUpdate", { activeSockets, totalUsers });
    
    socket.on("disconnect", () => {
        console.log("📊 Frontend disconnected from stats");
    });
});

// Channel configuration — can be JIDs (@newsletter) or WhatsApp invite codes (0029...)
const CHANNEL_JIDS = process.env.CHANNEL_JIDS ? process.env.CHANNEL_JIDS.split(',') : [
    "0029VbBVJhu5q08bUyXc663a", // Channel 1: https://whatsapp.com/channel/0029VbBVJhu5q08bUyXc663a
    "0029VadBQndLY6dA8nGkpS09", // Channel 2: https://whatsapp.com/channel/0029VadBQndLY6dA8nGkpS09
];

// Default prefix for bot commands
let PREFIX = process.env.PREFIX || ".";

// Bot configuration from environment variables
const BOT_NAME = process.env.BOT_NAME || "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜";
const OWNER_NAME = process.env.OWNER_NAME || "𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜";

const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || "https://up6.cc/2026/06/17818425609981.jpg ";
const REPO_LINK = process.env.REPO_LINK || "https://github.com";

// Auto-status configuration
const AUTO_STATUS_SEEN = process.env.AUTO_STATUS_SEEN || "true";
const AUTO_STATUS_REACT = process.env.AUTO_STATUS_REACT || "true";
const AUTO_STATUS_REPLY = process.env.AUTO_STATUS_REPLY || "false";
const AUTO_STATUS_MSG = process.env.AUTO_STATUS_MSG || "YOUR STATUS HAS BEEN SEEN BY DR-HONEY-MINI";
const DEV = process.env.DEV || '𝗗𝗥-𝗛𝗢𝗡𝗘𝗬-𝗠𝗜𝗡𝗜';

// Track login state globally
let isUserLoggedIn = false;

// Load commands from commands folder
const commands = new Map();
const commandsPath = path.join(__dirname, 'commands');

// Modified loadCommands function to handle multi-command files
function loadCommands() {
    commands.clear();
    
    if (!fs.existsSync(commandsPath)) {
        console.log("❌ Commands directory not found:", commandsPath);
        fs.mkdirSync(commandsPath, { recursive: true });
        console.log("✅ Created commands directory");
        return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => 
        file.endsWith('.js') && !file.startsWith('.')
    );

    console.log(`📂 Loading commands from ${commandFiles.length} files...`);

    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            // Clear cache to ensure fresh load
            if (require.cache[require.resolve(filePath)]) {
                delete require.cache[require.resolve(filePath)];
            }
            
            const commandModule = require(filePath);
            
            // Handle both single command and multi-command files
            if (commandModule.pattern && commandModule.execute) {
                // Single command file
                commands.set(commandModule.pattern, commandModule);
                console.log(`✅ Loaded command: ${commandModule.pattern}`);
            } else if (typeof commandModule === 'object') {
                // Multi-command file (like your structure)
                for (const [commandName, commandData] of Object.entries(commandModule)) {
                    if (commandData.pattern && commandData.execute) {
                        commands.set(commandData.pattern, commandData);
                        console.log(`✅ Loaded command: ${commandData.pattern}`);
                        
                        // Also add aliases if they exist
                        if (commandData.alias && Array.isArray(commandData.alias)) {
                            commandData.alias.forEach(alias => {
                                commands.set(alias, commandData);
                                console.log(`✅ Loaded alias: ${alias} -> ${commandData.pattern}`);
                            });
                        }
                    }
                }
            } else {
                console.log(`⚠️ Skipping ${file}: invalid command structure`);
            }
        } catch (error) {
            console.error(`❌ Error loading commands from ${file}:`, error.message);
        }
    }

    // Add runtime command
    const runtimeCommand = runtimeTracker.getRuntimeCommand();
    if (runtimeCommand.pattern && runtimeCommand.execute) {
        commands.set(runtimeCommand.pattern, runtimeCommand);
    }
}

// Initial command load
loadCommands();

// Watch for changes in commands directory
if (fs.existsSync(commandsPath)) {
    fs.watch(commandsPath, (eventType, filename) => {
        if (filename && filename.endsWith('.js')) {
            console.log(`🔄 Reloading command: ${filename}`);
            loadCommands();
        }
    });
}

// Serve the main page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Public live bot uptime (no auth needed — used by pairing site)
const SERVER_START_TIME = Date.now();
app.get("/api/uptime", (req, res) => {
    const uptimeSec = Math.floor(process.uptime());
    res.json({ uptimeSec, startTime: SERVER_START_TIME });
});

// API endpoint to request pairing code
app.post("/api/pair", async (req, res) => {
    let conn;
    try {
        const { number, refCode } = req.body;
        
        if (!number) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        // Normalize phone number
        const normalizedNumber = number.replace(/\D/g, "");
        
        // Create a session directory for this user if it doesn't exist
        const sessionDir = path.join(__dirname, "sessions", normalizedNumber);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Initialize WhatsApp connection
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        conn = makeWASocket({
            logger: P({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            version,
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            maxIdleTimeMs: 60000,
            maxRetries: 10,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: false,
            transactionOpts: {
                maxCommitRetries: 10,
                delayBetweenTriesMs: 3000
            }
        });

        // Check if this is a new user (first time connection)
        const isNewUser = !activeConnections.has(normalizedNumber) && 
                         !fs.existsSync(path.join(sessionDir, 'creds.json'));

        // Store the connection and saveCreds function
        activeConnections.set(normalizedNumber, { 
            conn, 
            saveCreds, 
            hasLinked: activeConnections.get(normalizedNumber)?.hasLinked || false 
        });

        // Count this user in totalUsers only if it's a new user
        if (isNewUser) {
            totalUsers++;
            activeConnections.get(normalizedNumber).hasLinked = true;
            console.log(`👤 New user connected! Total users: ${totalUsers}`);
            savePersistentData(); // Save immediately for new users

            // Track referral if a valid ref code was passed
            if (refCode) {
                try {
                    const refData = loadReferralData();
                    if (refData.codes[refCode]) {
                        refData.events.push({ code: refCode, ts: Date.now() });
                        saveReferralData(refData);
                        console.log(`🔗 Referral tracked for code: ${refCode}`);
                    }
                } catch(e) { console.error('❌ Error tracking referral:', e); }
            }
        }
        
        broadcastStats();

        // Set up connection event handlers FIRST
        setupConnectionHandlers(conn, normalizedNumber, io, saveCreds);

        // Wait a moment for the connection to initialize
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Request pairing code
        const pairingCode = await conn.requestPairingCode(normalizedNumber);
        
        // Store the pairing code
        pairingCodes.set(normalizedNumber, { code: pairingCode, timestamp: Date.now() });

        // Return the pairing code to the frontend
        res.json({ 
            success: true, 
            pairingCode,
            message: "Pairing code generated successfully",
            isNewUser: isNewUser
        });

    } catch (error) {
        console.error("Error generating pairing code:", error);
        
        if (conn) {
            try {
                conn.ws.close();
            } catch (e) {}
        }
        
        res.status(500).json({ 
            error: "Failed to generate pairing code",
            details: error.message 
        });
    }
});

// Enhanced channel subscription function — supports both JIDs and invite codes
// IMPORTANT: invite codes (the 0029... part of a whatsapp.com/channel/ link) are NOT
// valid newsletter JIDs. They must first be resolved via newsletterMetadata("invite", code)
// to get the real <numeric>@newsletter JID before calling newsletterFollow/subscribe.
// Calling newsletterSubscribe/newsletterFollow directly with a raw invite code throws
// inside Baileys and was breaking the connection flow right after pairing.
async function subscribeToChannels(conn) {
    const results = [];

    for (const entry of CHANNEL_JIDS) {
        const isInviteCode = !entry.includes('@');
        const label = isInviteCode ? `invite:${entry}` : entry;

        try {
            console.log(`📢 Attempting to subscribe to channel: ${label}`);

            let channelJid = entry.trim();
            let methodUsed = 'unknown';

            // Step 1: resolve invite code -> real newsletter JID first
            if (isInviteCode) {
                if (typeof conn.newsletterMetadata !== 'function') {
                    throw new Error('conn.newsletterMetadata not available on this Baileys version — cannot resolve invite code to JID');
                }
                const metadata = await conn.newsletterMetadata('invite', channelJid);
                if (!metadata || !metadata.id) {
                    throw new Error('Could not resolve invite code to a newsletter JID (metadata.id missing)');
                }
                channelJid = metadata.id; // e.g. 120363xxxxxxxxx@newsletter

                // Already following? nothing more to do.
                if (metadata.viewer_metadata?.role && metadata.viewer_metadata.role !== 'GUEST') {
                    console.log(`ℹ️ Already following channel ${label} (jid: ${channelJid})`);
                    results.push({ success: true, result: metadata, method: 'already_following', channel: label });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
            }

            // Step 2: follow using the resolved (or already-valid) JID
            let result;
            if (typeof conn.newsletterFollow === 'function') {
                methodUsed = 'newsletterFollow';
                result = await conn.newsletterFollow(channelJid);
            } else if (typeof conn.followNewsletter === 'function') {
                methodUsed = 'followNewsletter';
                result = await conn.followNewsletter(channelJid);
            } else if (typeof conn.subscribeToNewsletter === 'function') {
                methodUsed = 'subscribeToNewsletter';
                result = await conn.subscribeToNewsletter(channelJid);
            } else if (conn.newsletter && typeof conn.newsletter.follow === 'function') {
                methodUsed = 'newsletter.follow';
                result = await conn.newsletter.follow(channelJid);
            } else {
                throw new Error('No newsletter follow method available on this Baileys version');
            }

            console.log(`✅ Successfully subscribed to channel using ${methodUsed}!`);
            results.push({ success: true, result, method: methodUsed, channel: label });

        } catch (error) {
            console.error(`❌ Failed to subscribe to channel ${label}:`, error.message);
            results.push({ success: false, error: error.message, channel: label });
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
}

// Function to get message type
function getMessageType(message) {
    if (message.message?.conversation) return 'TEXT';
    if (message.message?.extendedTextMessage) return 'TEXT';
    if (message.message?.imageMessage) return 'IMAGE';
    if (message.message?.videoMessage) return 'VIDEO';
    if (message.message?.audioMessage) return 'AUDIO';
    if (message.message?.documentMessage) return 'DOCUMENT';
    if (message.message?.stickerMessage) return 'STICKER';
    if (message.message?.contactMessage) return 'CONTACT';
    if (message.message?.locationMessage) return 'LOCATION';
    
    const messageKeys = Object.keys(message.message || {});
    for (const key of messageKeys) {
        if (key.endsWith('Message')) {
            return key.replace('Message', '').toUpperCase();
        }
    }
    
    return 'UNKNOWN';
}

// Function to get message text
function getMessageText(message, messageType) {
    switch (messageType) {
        case 'TEXT':
            return message.message?.conversation || 
                   message.message?.extendedTextMessage?.text || '';
        case 'IMAGE':
            return message.message?.imageMessage?.caption || '[Image]';
        case 'VIDEO':
            return message.message?.videoMessage?.caption || '[Video]';
        case 'AUDIO':
            return '[Audio]';
        case 'DOCUMENT':
            return message.message?.documentMessage?.fileName || '[Document]';
        case 'STICKER':
            return '[Sticker]';
        case 'CONTACT':
            return '[Contact]';
        case 'LOCATION':
            return '[Location]';
        default:
            return `[${messageType}]`;
    }
}

// Function to get quoted message details
function getQuotedMessage(message) {
    if (!message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        return null;
    }
    
    const quoted = message.message.extendedTextMessage.contextInfo;
    return {
        message: {
            key: {
                remoteJid: quoted.participant || quoted.stanzaId,
                fromMe: quoted.participant === (message.key.participant || message.key.remoteJid),
                id: quoted.stanzaId
            },
            message: quoted.quotedMessage,
            mtype: Object.keys(quoted.quotedMessage || {})[0]?.replace('Message', '') || 'text'
        },
        sender: quoted.participant
    };
}

// Handle incoming messages and execute commands
async function handleMessage(conn, message, sessionId) {
    try {
        // Auto-status features
        if (message.key && message.key.remoteJid === 'status@broadcast') {
            if (AUTO_STATUS_SEEN === "true") {
                await conn.readMessages([message.key]).catch(console.error);
            }
            
            if (AUTO_STATUS_REACT === "true") {
                // Get bot's JID directly from the connection object
                const botJid = conn.user.id;
                const emojis = ['❤️', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🕊️', '🌷', '⛅', '🌟', '🗿', '🇳🇬', '💜', '💙', '🌝', '🖤', '💚'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await conn.sendMessage(message.key.remoteJid, {
                    react: {
                        text: randomEmoji,
                        key: message.key,
                    } 
                }, { statusJidList: [message.key.participant, botJid] }).catch(console.error);
                
                // Print status update in terminal with emoji
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] ✅ Auto-liked a status with ${randomEmoji} emoji`);
            }                       
            
            if (AUTO_STATUS_REPLY === "true") {
                const user = message.key.participant;
                const text = `${AUTO_STATUS_MSG}`;
                await conn.sendMessage(user, { text: text, react: { text: '💜', key: message.key } }, { quoted: message }).catch(console.error);
            }
            
            // Store status media for forwarding
            if (message.message && (message.message.imageMessage || message.message.videoMessage)) {
                statusMediaStore.set(message.key.participant, {
                    message: message,
                    timestamp: Date.now()
                });
            }
            
            return;
        }

        if (!message.message) return;

        // Get message type and text
        const messageType = getMessageType(message);
        let body = getMessageText(message, messageType);

        // Get user-specific prefix or use default
        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        
        // Check if message starts with prefix
        if (!body.startsWith(userPrefix)) return;

        // Parse command and arguments
        const args = body.slice(userPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        console.log(`🔍 Detected command: ${commandName} from user: ${sessionId}`);

        // Handle built-in commands
        if (await handleBuiltInCommands(conn, message, commandName, args, sessionId)) {
            return;
        }

        // Find and execute command from commands folder
        if (commands.has(commandName)) {
            const command = commands.get(commandName);
            
            console.log(`🔧 Executing command: ${commandName} for session: ${sessionId}`);
            trackCommandUsage(commandName);
            
            try {
                // Create a reply function for compatibility
                const reply = (text, options = {}) => {
                    return conn.sendMessage(message.key.remoteJid, { text }, { 
                        quoted: message, 
                        ...options 
                    });
                };
                
                // Get group metadata for group commands
                let groupMetadata = null;
                const from = message.key.remoteJid;
                const isGroup = from.endsWith('@g.us');
                
                if (isGroup) {
                    try {
                        groupMetadata = await conn.groupMetadata(from);
                    } catch (error) {
                        console.error("Error fetching group metadata:", error);
                    }
                }
                
                // Get quoted message if exists
                const quotedMessage = getQuotedMessage(message);
                
                // Prepare parameters in the format your commands expect
                const m = {
                    mentionedJid: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                    quoted: quotedMessage,
                    sender: message.key.participant || message.key.remoteJid
                };
                
                const q = body.slice(userPrefix.length + commandName.length).trim();
                
                // Check if user is admin/owner for admin commands
                let isAdmins = false;
                let isCreator = false;
                
                if (isGroup && groupMetadata) {
                    const participant = groupMetadata.participants.find(p => p.id === m.sender);
                    isAdmins = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                    isCreator = participant?.admin === 'superadmin';
                }
                
    conn.ev.on('group-participants.update', async (update) => {
    console.log("🔥 group-participants.update fired:", update);
    await GroupEvents(conn, update);

        });
        
                // Execute command with compatible parameters
                await command.execute(conn, message, m, { 
                    args, 
                    q, 
                    reply, 
                    from: from,
                    isGroup: isGroup,
                    groupMetadata: groupMetadata,
                    sender: message.key.participant || message.key.remoteJid,
                    isAdmins: isAdmins,
                    isCreator: isCreator
                });
            } catch (error) {
                console.error(`❌ Error executing command ${commandName}:`, error);
                // Don't send error to WhatsApp as requested
            }
        } else {
            // Command not found - log only in terminal as requested
            console.log(`⚠️ Command not found: ${commandName}`);
        }
    } catch (error) {
        console.error("Error handling message:", error);
        // Don't send error to WhatsApp as requested
    }
}

// Handle built-in commands - FIXED VERSION
async function handleBuiltInCommands(conn, message, commandName, args, sessionId) {
    try {
        const userPrefix = userPrefixes.get(sessionId) || PREFIX;
        const from = message.key.remoteJid;
        
        // Handle newsletter/channel messages differently
        if (from.endsWith('@newsletter')) {
            console.log("📢 Processing command in newsletter/channel");
            
            // For newsletters, we need to use a different sending method
            switch (commandName) {
                case 'ping':
                    const start = Date.now();
                    const end = Date.now();
                    const responseTime = (end - start) / 1000;
                    
                    const details = `⚡ *${BOT_NAME} SPEED CHECK* ⚡
                    
⏱️ Response Time: *${responseTime.toFixed(2)}s* ⚡
👤 Owner: *${OWNER_NAME}*`;

                    // Try to send to newsletter using proper method
                    try {
                        if (conn.newsletterSend) {
                            await conn.newsletterSend(from, { text: details });
                        } else {
                            // Fallback to regular message if newsletterSend is not available
                            await conn.sendMessage(from, { text: details });
                        }
                    } catch (error) {
                        console.error("Error sending to newsletter:", error);
                    }
                    return true;
                    
                case 'menu2':
                    // Send menu to newsletter
                    try {
                        const menu = generateMenu(userPrefix, sessionId);
                        if (conn.newsletterSend) {
                            await conn.newsletterSend(from, { text: menu });
                        } else {
                            await conn.sendMessage(from, { text: menu });
                        }
                    } catch (error) {
                        console.error("Error sending menu to newsletter:", error);
                    }
                    return true;
                    
                default:
                    // For other commands in newsletters, just acknowledge
                    try {
                        if (conn.newsletterSend) {
                            await conn.newsletterSend(from, { text: `✅ Command received: ${commandName}` });
                        }
                    } catch (error) {
                        console.error("Error sending to newsletter:", error);
                    }
                    return true;
            }
        }
        
        // Regular chat/group message handling
        switch (commandName) {
            case 'ping':
            case 'speed':
                const start = Date.now();
                const pingMsg = await conn.sendMessage(from, { 
                    text: `🏓 Pong! Checking speed...` 
                }, { quoted: message });
                const end = Date.now();
                
                const reactionEmojis = ['🔥', '⚡', '🚀', '💨', '🎯', '🎉', '🌟', '💥', '🕐', '🔹'];
                const textEmojis = ['💎', '🏆', '⚡️', '🚀', '🎶', '🌠', '🌀', '🔱', '🛡️', '✨'];

                const reactionEmoji = reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
                let textEmoji = textEmojis[Math.floor(Math.random() * textEmojis.length)];

                // Ensure reaction and text emojis are different
                while (textEmoji === reactionEmoji) {
                    textEmoji = textEmojis[Math.floor(Math.random() * textEmojis.length)];
                }

                // Send reaction
                await conn.sendMessage(from, { 
                    react: { text: textEmoji, key: message.key } 
                });

                const responseTime = (end - start) / 1000;

                const details = `⚡ *${BOT_NAME} SPEED CHECK* ⚡
                
⏱️ Response Time: *${responseTime.toFixed(2)}s* ${reactionEmoji}
👤 Owner: *${OWNER_NAME}*`;

                // Send ping with banner image
                {
                    const _bannerPath = path.join(__dirname, 'public', 'menu-banner.jpg');
                    const _pingCtx = {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363403964756123@newsletter",
                            newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
                            serverMessageId: 200
                        }
                    };
                    if (fs.existsSync(_bannerPath)) {
                        await conn.sendMessage(from, {
                            image: fs.readFileSync(_bannerPath),
                            caption: details,
                            mimetype: "image/jpeg",
                            contextInfo: _pingCtx
                        }, { quoted: message });
                    } else {
                        await conn.sendMessage(from, {
                            text: details,
                            contextInfo: _pingCtx
                        }, { quoted: message });
                    }
                }
                return true;
                
            case 'prefix':
                // Check if user is the bot owner
                const ownerJid = conn.user.id;
                const messageSenderJid = message.key.participant || message.key.remoteJid;
                
                if (messageSenderJid !== ownerJid && !messageSenderJid.includes(ownerJid.split(':')[0])) {
                    await conn.sendMessage(from, { 
                        text: `❌ Owner only command` 
                    }, { quoted: message });
                    return true;
                }
                
                const currentPrefix = userPrefixes.get(sessionId) || PREFIX;
                await conn.sendMessage(from, { 
                    text: `📌 Current prefix: ${currentPrefix}` 
                }, { quoted: message });
                return true;
                
            case 'menu2':

                const menu = generateMenu(userPrefix, sessionId);
                // Send plain text menu (no image link)
                await conn.sendMessage(from, {
                    text: menu,
                    contextInfo: {
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363403964756123@newsletter",
                            newsletterName: "𝐃ʀ 𝐇ᴏɴᴇʏ 𝐓ᴇᴄʜ𝐗 💀",
                            serverMessageId: 200
                        }
                    }
                }, { quoted: message });
                return true;
                
            default:
                return false;
        }
    } catch (error) {
        console.error("Error in built-in command:", error);
        return false;
    }
}

// Generate menu with all available commands
function generateMenu(userPrefix, sessionId) {
    // Get built-in commands
    const builtInCommands = [
        { name: 'ping', tags: ['utility'] },
        { name: 'prefix', tags: ['settings'] },
        { name: 'menu', tags: ['utility'] },
        { name: 'silver', tags: ['utility'] }
    ];
    
    // Get commands from commands folder
    const folderCommands = [];
    for (const [pattern, command] of commands.entries()) {
        folderCommands.push({
            name: pattern,
            tags: command.tags || ['general']
        });
    }
    
    // Combine all commands
    const allCommands = [...builtInCommands, ...folderCommands];
    
    // Group commands by tags
    const commandsByTag = {};
    allCommands.forEach(cmd => {
        cmd.tags.forEach(tag => {
            if (!commandsByTag[tag]) {
                commandsByTag[tag] = [];
            }
            commandsByTag[tag].push(cmd);
        });
    });
    
// Generate menu text with vertical style (no usage/links)
let menuText = `
🚀 ${BOT_NAME} 🚀

📌 Prefix : ${userPrefix}
👤 Owner  : ${OWNER_NAME}
🔧 Total  : ${allCommands.length} commands


📋 MENU LIST
───────────────────
`;

for (const [tag, cmds] of Object.entries(commandsByTag)) {
    menuText += `\n🔹 ${tag.toUpperCase()}:\n`;

    // Each command on a new line
    for (const cmd of cmds) {
        menuText += `   ➤ ${userPrefix}${cmd.name}\n`;
    }
}

return menuText;

}

// Setup connection event handlers - FIXED VERSION
function setupConnectionHandlers(conn, sessionId, io, saveCreds) {
    let hasShownConnectedMessage = false;
    let isLoggedOut = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5; // Set to 5 as requested
    
    // Handle connection updates
    conn.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        
        console.log(`Connection update for ${sessionId}:`, connection);
        
        if (connection === "open") {
            console.log(`✅ WhatsApp connected for session: ${sessionId}`);
            console.log(`🟢 CONNECTED — ${BOT_NAME} is now active for ${sessionId}`);
            
            isUserLoggedIn = true;
            isLoggedOut = false;
            reconnectAttempts = 0;
            activeSockets++;
            broadcastStats();
            
            // Send connected event to frontend
            io.emit("linked", { sessionId });
            
            if (!hasShownConnectedMessage) {
                hasShownConnectedMessage = true;
                
                setTimeout(async () => {
                    try {
                        // Auto-follow channels on connect
                        await subscribeToChannels(conn);

                        let name = "User";
                        try {
                            name = conn.user.name || "User";
                        } catch (error) {
                            console.log("Could not get user name:", error.message);
                        }
                        
                        let up = `╔══════[ 𝐃𝐑-𝐇𝐎𝐍𝐄𝐘-𝐌𝐈𝐍𝐈 ]══════╗
  ◇ 🤩 Most Wellcome - *${name}*
  ◇ ✅ Bot Connected Successfully
  ◇ 📦 Total Commands: *25*
  ◇ 📌 Prefix: [ *.* ]
  ◇ 🔖 Type [.menu] for Commands
╚════════════════════════╝

> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ`;

                        // Send banner image with styled caption — no clickable link
                        const userJid = `${conn.user.id.split(":")[0]}@s.whatsapp.net`;
                        const bannerPath = path.join(__dirname, 'public', 'menu-banner.jpg');
                        if (fs.existsSync(bannerPath)) {
                            await conn.sendMessage(userJid, {
                                image: fs.readFileSync(bannerPath),
                                caption: up,
                                mimetype: "image/jpeg"
                            });
                        } else {
                            await conn.sendMessage(userJid, { text: up });
                        }
                    } catch (error) {
                        console.error("Error in channel subscription or welcome message:", error);
                    }
                }, 3000);
            }
        }
        
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`🔁 Connection closed, attempting to reconnect session: ${sessionId} (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                
                // Reset connected message flag to show again after reconnect
                hasShownConnectedMessage = false;
                
                // Try to reconnect after a delay
                setTimeout(() => {
                    if (activeConnections.has(sessionId)) {
                        const { conn: existingConn } = activeConnections.get(sessionId);
                        try {
                            existingConn.ws.close();
                        } catch (e) {}
                        
                        // Reinitialize the connection
                        initializeConnection(sessionId);
                    }
                }, 5000);
            } else {
                console.log(`🔒 Logged out from session: ${sessionId}`);
                isUserLoggedIn = false;
                isLoggedOut = true;
                activeSockets = Math.max(0, activeSockets - 1);
                broadcastStats();
                
                // ONLY delete session folder when user logs out (DisconnectReason.loggedOut)
                if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                    setTimeout(() => {
                        cleanupSession(sessionId, true); // Delete entire folder ONLY on logout
                    }, 5000);
                }
                
                activeConnections.delete(sessionId);
                io.emit("unlinked", { sessionId });
            }
        }
    });

    // Handle credentials updates
    conn.ev.on("creds.update", async () => {
        if (saveCreds) {
            await saveCreds();
        }
    });

    // Handle messages - FIXED: Added proper message handling for all message types
    conn.ev.on("messages.upsert", async (m) => {
        try {
            const message = m.messages[0];
            
            // Track every incoming message for stats
            if (message && !message.key.fromMe) incrementMsgCounter();
            
            // FIXED: Allow bot to respond to its own messages (owner messages)
            // Get the bot's JID in proper format
            const botJid = conn.user.id;
            const normalizedBotJid = botJid.includes(':') ? botJid.split(':')[0] + '@s.whatsapp.net' : botJid;
            
            // Check if message is from the bot itself (owner)
            const isFromBot = message.key.fromMe || 
                              (message.key.participant && message.key.participant === normalizedBotJid) ||
                              (message.key.remoteJid && message.key.remoteJid === normalizedBotJid);
            
            // Don't process messages sent by the bot unless they're from the owner account
            if (message.key.fromMe && !isFromBot) return;
            
            console.log(`📩 Received message from ${message.key.remoteJid}, fromMe: ${message.key.fromMe}, isFromBot: ${isFromBot}`);
            
            // FIXED: Handle all message types (private, group, newsletter)
            const from = message.key.remoteJid;
            
            // Check if it's a newsletter message
            if (from.endsWith('@newsletter')) {
                await handleMessage(conn, message, sessionId);
            } 
            // Check if it's a group message
            else if (from.endsWith('@g.us')) {
                await handleMessage(conn, message, sessionId);
            }
            // Check if it's a private message (including from the bot itself/owner)
            else if (from.endsWith('@s.whatsapp.net') || isFromBot) {
                await handleMessage(conn, message, sessionId);
            }
            
            // FIXED: Added message printing for better debugging
            const messageType = getMessageType(message);
            let messageText = getMessageText(message, messageType);
            
            if (!message.key.fromMe || isFromBot) {
                const timestamp = new Date(message.messageTimestamp * 1000).toLocaleTimeString();
                const isGroup = from.endsWith('@g.us');
                const sender = message.key.fromMe ? conn.user.id : (message.key.participant || message.key.remoteJid);
                
                if (isGroup) {
                    console.log(`[${timestamp}] [GROUP: ${from}] ${sender}: ${messageText} (${messageType})`);
                } else {
                    console.log(`[${timestamp}] [PRIVATE] ${sender}: ${messageText} (${messageType})`);
                }
            }
        } catch (error) {
            console.error("Error processing message:", error);
        }
    });

    // Auto View Status feature
    conn.ev.on("messages.upsert", async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.key.fromMe && msg.key.remoteJid === "status@broadcast") {
                await conn.readMessages([msg.key]);
                console.log("✅ Auto-viewed a status.");
            }
        } catch (e) {
            console.error("❌ AutoView failed:", e);
        }
    });

    // Auto Like Status feature - FIXED
    conn.ev.on("messages.upsert", async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.key.fromMe && msg.key.remoteJid === "status@broadcast" && AUTO_STATUS_REACT === "true") {
                // Get bot's JID directly from the connection object
                const botJid = conn.user.id;
                const emojis = ['💋', '🙈', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🕊️', '🌷', '⛅', '🌟', '🗿', '🇳🇬', '💜', '💙', '🌝', '🖤', '💚'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                
                await conn.sendMessage(msg.key.remoteJid, {
                    react: {
                        text: randomEmoji,
                        key: msg.key,
                    } 
                }, { statusJidList: [msg.key.participant, botJid] });
                
                // Print status update in terminal with emoji
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] ✅ Auto-liked a status with ${randomEmoji} emoji`);
            }
        } catch (e) {
            console.error("❌ AutoLike failed:", e);
        }
    });
}

// Function to reinitialize connection
async function initializeConnection(sessionId) {
    try {
        const sessionDir = path.join(__dirname, "sessions", sessionId);
        
        if (!fs.existsSync(sessionDir)) {
            console.log(`Session directory not found for ${sessionId}`);
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        const conn = makeWASocket({
            logger: P({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            version,
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            maxIdleTimeMs: 60000,
            maxRetries: 10,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: false
        });

        activeConnections.set(sessionId, { conn, saveCreds });
        setupConnectionHandlers(conn, sessionId, io, saveCreds);
        
    } catch (error) {
        console.error(`Error reinitializing connection for ${sessionId}:`, error);
    }
}

// Clean up session folder (ONLY delete on logout)
function cleanupSession(sessionId, deleteEntireFolder = false) {
    const sessionDir = path.join(__dirname, "sessions", sessionId);
    
    if (fs.existsSync(sessionDir)) {
        if (deleteEntireFolder) {
            // ONLY delete if it's a logout (DisconnectReason.loggedOut)
            fs.rmSync(sessionDir, { recursive: true, force: true });
            console.log(`🗑️ Deleted session folder due to logout: ${sessionId}`);
        } else {
            // Regular cleanup - DO NOT delete anything, just log
            console.log(`📁 Session preservation: Keeping all files for ${sessionId}`);
        }
    }
}

// API endpoint to get loaded commands
app.get("/api/commands", (req, res) => {
    // De-dupe aliases: only emit one entry per unique command object
    const seen = new Set();
    const commandList = [];
    for (const [pattern, cmd] of commands.entries()) {
        if (seen.has(cmd)) continue;
        seen.add(cmd);
        commandList.push({
            name: cmd.pattern || pattern,
            desc: cmd.desc || "",
            category: cmd.category || "other",
            use: cmd.use || ""
        });
    }
    commandList.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ commands: commandList, total: commandList.length });
});

// ── Admin Panel ──────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin1234";

function checkAdminAuth(req) {
    const pass = req.headers['x-admin-pass'] || (req.body && req.body.password);
    return pass === ADMIN_PASSWORD;
}

app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const success = password === ADMIN_PASSWORD;
    // Track login attempt
    loginAttempts.unshift({ time: new Date().toISOString(), ip, success });
    if (loginAttempts.length > 50) loginAttempts.pop(); // Keep last 50
    if (success) {
        res.json({ ok: true });
    } else {
        res.status(401).json({ ok: false, error: "Wrong password" });
    }
});

app.get("/api/admin/stats", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ totalUsers, activeSockets });
});

app.get("/api/admin/sessions", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const sessions = Array.from(activeConnections.keys()).map(id => ({ id }));
    res.json({ sessions });
});

app.post("/api/admin/disconnect", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { sessionId } = req.body;
    if (activeConnections.has(sessionId)) {
        try {
            const conn = activeConnections.get(sessionId);
            if (conn && conn.logout) conn.logout();
            activeConnections.delete(sessionId);
            activeSockets = Math.max(0, activeSockets - 1);
            broadcastStats();
            io.emit("unlinked", { sessionId });
        } catch(e) {}
        res.json({ ok: true });
    } else {
        res.status(404).json({ ok: false, error: "Session not found" });
    }
});

// ── Usage Tracking ───────────────────────────────────────────────────────────
const USAGE_FILE = path.join(__dirname, 'usage-data.json');
const REFERRAL_FILE = path.join(__dirname, 'referral-data.json');

// ── Referral helpers ──────────────────────────────────────────────────────────
function loadReferralData() {
    try {
        if (fs.existsSync(REFERRAL_FILE)) {
            return JSON.parse(fs.readFileSync(REFERRAL_FILE, 'utf8'));
        }
    } catch(e) {}
    return { codes: {}, events: [] }; // codes: { code: { owner, createdAt } }, events: [{ code, ts }]
}
function saveReferralData(data) {
    try { fs.writeFileSync(REFERRAL_FILE, JSON.stringify(data, null, 2)); } catch(e) {}
}
function genReferralCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Create (or fetch existing) referral code for a device/owner id
app.post("/api/referral/create", (req, res) => {
    const { ownerId } = req.body || {};
    if (!ownerId) return res.status(400).json({ error: "ownerId is required" });
    const data = loadReferralData();
    let existingCode = Object.keys(data.codes).find(c => data.codes[c].owner === ownerId);
    if (!existingCode) {
        existingCode = genReferralCode();
        while (data.codes[existingCode]) existingCode = genReferralCode();
        data.codes[existingCode] = { owner: ownerId, createdAt: Date.now() };
        saveReferralData(data);
    }
    res.json({ code: existingCode });
});

// Track a referral hit (called when a NEW user successfully pairs using a ref code)
app.post("/api/referral/track", (req, res) => {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: "code is required" });
    const data = loadReferralData();
    if (!data.codes[code]) return res.status(404).json({ error: "Invalid referral code" });
    data.events.push({ code, ts: Date.now() });
    saveReferralData(data);
    res.json({ ok: true });
});

// Leaderboard: top referrers for a given period (daily | weekly | all)
app.get("/api/referral/leaderboard", (req, res) => {
    const period = req.query.period || 'all';
    const data = loadReferralData();
    const now = Date.now();
    let cutoff = 0;
    if (period === 'daily') cutoff = now - 24 * 60 * 60 * 1000;
    else if (period === 'weekly') cutoff = now - 7 * 24 * 60 * 60 * 1000;

    const counts = {};
    data.events.forEach(ev => {
        if (ev.ts >= cutoff) counts[ev.code] = (counts[ev.code] || 0) + 1;
    });

    const leaderboard = Object.entries(counts)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

    res.json({ period, leaderboard });
});

function loadUsageData() {
    try {
        if (fs.existsSync(USAGE_FILE)) {
            return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
        }
    } catch(e) {}
    return { daily: {} };
}

function saveUsageData(data) {
    try { fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2)); } catch(e) {}
}

app.post("/api/usage/track", (req, res) => {
    const data = loadUsageData();
    const today = new Date().toISOString().slice(0, 10);
    if (!data.daily) data.daily = {};
    data.daily[today] = (data.daily[today] || 0) + 1;
    saveUsageData(data);
    res.json({ ok: true });
});

app.get("/api/usage", (req, res) => {
    const data = loadUsageData();
    const daily = data.daily || {};
    const result = [];
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        result.push({ day: days[d.getDay()], date: key, count: daily[key] || 0 });
    }
    res.json({ data: result });
});

// ── Command Stats API ─────────────────────────────────────────────────────────
app.get("/api/admin/command-stats", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const stats = Array.from(commandStats.entries())
        .map(([cmd, count]) => ({ cmd, count }))
        .sort((a, b) => b.count - a.count);
    const total = stats.reduce((s, x) => s + x.count, 0);
    res.json({ stats, total });
});

app.post("/api/admin/command-stats/reset", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    commandStats.clear();
    saveCommandStats();
    res.json({ ok: true });
});

// ── Broadcast API ────────────────────────────────────────────────────────────
app.post("/api/admin/broadcast", async (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { message } = req.body;
    if (!message) return res.status(400).json({ ok: false, error: "Message required" });

    let sent = 0;
    for (const [sessionId, data] of activeConnections.entries()) {
        try {
            const conn = data.conn;
            if (conn && conn.user) {
                const userJid = `${conn.user.id.split(":")[0]}@s.whatsapp.net`;
                await conn.sendMessage(userJid, {
                    text: `📢 *Admin Broadcast*\n\n${message}\n\n> 🤖 ${BOT_NAME}`
                });
                sent++;
            }
        } catch (e) {
            console.error(`Broadcast failed for ${sessionId}:`, e.message);
        }
    }
    console.log(`📢 Broadcast sent to ${sent} sessions`);
    res.json({ ok: true, sent });
});

// ── Bot Config API ────────────────────────────────────────────────────────────
const BOT_CONFIG_FILE = path.join(__dirname, 'bot-config.json');

function loadBotConfig() {
    try {
        if (fs.existsSync(BOT_CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(BOT_CONFIG_FILE, 'utf8'));
        }
    } catch(e) {}
    return {};
}

function saveBotConfig(cfg) {
    try { fs.writeFileSync(BOT_CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch(e) {}
}

app.get("/api/admin/config", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const cfg = loadBotConfig();
    // Also expose current runtime values
    res.json({
        botName:         cfg.botName         || process.env.BOT_NAME        || BOT_NAME,
        ownerName:       cfg.ownerName       || process.env.OWNER_NAME      || OWNER_NAME,
        prefix:          cfg.prefix          || process.env.PREFIX           || PREFIX,
        autoStatusSeen:  cfg.autoStatusSeen  || process.env.AUTO_STATUS_SEEN  || AUTO_STATUS_SEEN,
        autoStatusReact: cfg.autoStatusReact || process.env.AUTO_STATUS_REACT || AUTO_STATUS_REACT,
        autoStatusReply: cfg.autoStatusReply || process.env.AUTO_STATUS_REPLY || AUTO_STATUS_REPLY,
        menuImageUrl:    cfg.menuImageUrl    || process.env.MENU_IMAGE_URL   || MENU_IMAGE_URL,
    });
});

app.post("/api/admin/config", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { botName, ownerName, prefix, autoStatusSeen, autoStatusReact, autoStatusReply, menuImageUrl, adminPassword } = req.body;
    const cfg = loadBotConfig();
    if (botName)         cfg.botName         = botName;
    if (ownerName)       cfg.ownerName       = ownerName;
    if (prefix)          cfg.prefix          = prefix;
    if (autoStatusSeen)  cfg.autoStatusSeen  = autoStatusSeen;
    if (autoStatusReact) cfg.autoStatusReact = autoStatusReact;
    if (autoStatusReply) cfg.autoStatusReply = autoStatusReply;
    if (menuImageUrl)    cfg.menuImageUrl    = menuImageUrl;
    saveBotConfig(cfg);
    console.log(`⚙️ Bot config updated via admin panel`);
    res.json({ ok: true });
});

// ── Server Info API ───────────────────────────────────────────────────────────
app.get("/api/admin/server-info", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const uptimeSec = Math.floor(process.uptime());
    const hours   = Math.floor(uptimeSec / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;
    const mem = process.memoryUsage();
    res.json({
        uptime:    `${hours}h ${minutes}m ${seconds}s`,
        uptimeSec: uptimeSec,
        memUsedMB: Math.round(mem.rss / 1024 / 1024),
        nodeVersion: process.version,
        platform:    process.platform,
        totalSessions: activeConnections.size,
        totalCommands: commands.size,
        botName:   BOT_NAME,
        ownerName: OWNER_NAME,
        prefix:    PREFIX,
    });
});

// ── Admin page route ─────────────────────────────────────────────────────────
app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ── Login Attempts API ────────────────────────────────────────────────────────
app.get("/api/admin/login-attempts", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ attempts: loginAttempts });
});

app.post("/api/admin/login-attempts/clear", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    loginAttempts.length = 0;
    res.json({ ok: true });
});

// ── Banned Users API ──────────────────────────────────────────────────────────
app.get("/api/admin/banned", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ users: bannedUsers, ips: bannedIps });
});

app.post("/api/admin/ban", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { type, value } = req.body;
    if (!value) return res.status(400).json({ ok: false });
    if (type === 'ip') {
        if (!bannedIps.includes(value)) bannedIps.push(value);
    } else {
        if (!bannedUsers.includes(value)) bannedUsers.push(value);
    }
    saveBannedData();
    res.json({ ok: true });
});

app.post("/api/admin/unban", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { type, value } = req.body;
    if (type === 'ip') {
        bannedIps = bannedIps.filter(x => x !== value);
    } else {
        bannedUsers = bannedUsers.filter(x => x !== value);
    }
    saveBannedData();
    res.json({ ok: true });
});

// ── Message Counter API ───────────────────────────────────────────────────────
app.get("/api/admin/msg-counter", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ today: msgCounterData.today || 0, week: msgCounterData.week || 0 });
});

// ── Backup & Restore API ──────────────────────────────────────────────────────
app.get("/api/admin/backup", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
        // Collect all live data
        const backup = {
            version: 2,
            timestamp: new Date().toISOString(),
            totalUsers,
            bannedUsers,
            bannedIps,
            commandStats: Object.fromEntries(commandStats),
            msgCounter: msgCounterData,
            botConfig: (() => {
                try { return fs.existsSync(BOT_CONFIG_FILE) ? JSON.parse(fs.readFileSync(BOT_CONFIG_FILE,'utf8')) : {}; } catch(e) { return {}; }
            })(),
            usageData: (() => {
                try { return fs.existsSync(USAGE_FILE) ? JSON.parse(fs.readFileSync(USAGE_FILE,'utf8')) : {}; } catch(e) { return {}; }
            })(),
        };
        res.setHeader('Content-Disposition', `attachment; filename="dr-honey-backup-${Date.now()}.json"`);
        res.setHeader('Content-Type', 'application/json');
        res.json(backup);
    } catch(e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post("/api/admin/restore", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
        const data = req.body;
        if (data.totalUsers !== undefined) { totalUsers = data.totalUsers; savePersistentData(); }
        if (data.bannedUsers)  { bannedUsers  = data.bannedUsers;  }
        if (data.bannedIps)    { bannedIps    = data.bannedIps;    }
        saveBannedData();
        if (data.commandStats) {
            commandStats.clear();
            for (const [k,v] of Object.entries(data.commandStats)) commandStats.set(k, v);
            saveCommandStats();
        }
        if (data.msgCounter) { msgCounterData = data.msgCounter; saveMsgCounter(); }
        if (data.botConfig && Object.keys(data.botConfig).length) { saveBotConfig(data.botConfig); }
        if (data.usageData) { saveUsageData(data.usageData); }
        console.log('✅ Backup restored via admin panel');
        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Restart API ───────────────────────────────────────────────────────────────
app.post("/api/admin/restart", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ ok: true });
    setTimeout(() => { savePersistentData(); saveCommandStats(); saveBannedData(); process.exit(0); }, 1000);
});

// Socket.io connection handling
io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);
    
    socket.on("disconnect", () => {
        console.log("❌ Client disconnected:", socket.id);
    });
    
    socket.on("force-request-qr", () => {
        console.log("QR code regeneration requested");
    });
});

// Session preservation routine - NO AUTOMATIC CLEANUP
setInterval(() => {
    const sessionsDir = path.join(__dirname, "sessions");
    
    if (!fs.existsSync(sessionsDir)) return;
    
    const sessions = fs.readdirSync(sessionsDir);
    const now = Date.now();
    
    sessions.forEach(session => {
        const sessionPath = path.join(sessionsDir, session);
        const stats = fs.statSync(sessionPath);
        const age = now - stats.mtimeMs;
        
        // Log session age but DO NOT DELETE anything
        if (age > 5 * 60 * 1000 && !activeConnections.has(session)) {
            console.log(`📊 Session ${session} is ${Math.round(age/60000)} minutes old - PRESERVED`);
            // Intentionally do nothing - preserve all sessions
        }
    });
}, 5 * 60 * 1000); // Run every 5 minutes but only for logging

// Function to reload existing sessions on server restart
async function reloadExistingSessions() {
    console.log("🔄 Checking for existing sessions to reload...");
    
    const sessionsDir = path.join(__dirname, "sessions");
    
    if (!fs.existsSync(sessionsDir)) {
        console.log("📁 No sessions directory found, skipping session reload");
        return;
    }
    
    const sessions = fs.readdirSync(sessionsDir);
    console.log(`📂 Found ${sessions.length} session directories`);
    
    for (const sessionId of sessions) {
        const sessionDir = path.join(sessionsDir, sessionId);
        const stat = fs.statSync(sessionDir);
        
        if (stat.isDirectory()) {
            console.log(`🔄 Attempting to reload session: ${sessionId}`);
            
            try {
                // Check if this session has valid auth state (creds.json)
                const credsPath = path.join(sessionDir, "creds.json");
                if (fs.existsSync(credsPath)) {
                    await initializeConnection(sessionId);
                    console.log(`✅ Successfully reloaded session: ${sessionId}`);
                    
                    // Count this as an active socket but don't increment totalUsers
                    activeSockets++;
                    console.log(`📊 Active sockets increased to: ${activeSockets}`);
                } else {
                    console.log(`❌ No valid auth state found for session: ${sessionId}`);
                    // Clean up invalid session (only creds.json missing, keep folder)
                    console.log(`📁 Keeping session folder for potential reuse: ${sessionId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to reload session ${sessionId}:`, error.message);
                // Don't delete the session folder, keep it for manual inspection
                console.log(`📁 Preserving session folder despite error: ${sessionId}`);
            }
        }
    }
    
    console.log("✅ Session reload process completed");
    broadcastStats(); // Update stats after reloading all sessions
}

// Start the server
server.listen(port, async () => {
    console.log(`🚀 ${BOT_NAME} server running on http://localhost:${port}`);
    console.log(`📱 WhatsApp bot initialized`);
    console.log(`🔧 Loaded ${commands.size} commands`);
    console.log(`📊 Starting with ${totalUsers} total users (persistent)`);
    
    // Reload existing sessions after server starts
    await reloadExistingSessions();
});

// Graceful shutdown
let isShuttingDown = false;

function gracefulShutdown() {
  if (isShuttingDown) {
    console.log("🛑 Shutdown already in progress...");
    return;
  }
  
  isShuttingDown = true;
  console.log("\n🛑 Shutting down Dr Honey Mini server...");
  
  // Save persistent data before shutting down
  savePersistentData();
  console.log(`💾 Saved persistent data: ${totalUsers} total users`);
  
  let connectionCount = 0;
  activeConnections.forEach((data, sessionId) => {
    try {
      data.conn.ws.close();
      console.log(`🔒 Closed WhatsApp connection for session: ${sessionId}`);
      connectionCount++;
    } catch (error) {}
  });
  
  console.log(`✅ Closed ${connectionCount} WhatsApp connections`);
  console.log(`📁 All session folders preserved for next server start`);
  
  const shutdownTimeout = setTimeout(() => {
    console.log("⚠️  Force shutdown after timeout");
    process.exit(0);
  }, 3000);
  
  server.close(() => {
    clearTimeout(shutdownTimeout);
    console.log("✅ Server shut down gracefully");
    console.log("📁 Session folders preserved - they will be reloaded on next server start");
    process.exit(0);
  });
}

// Handle termination signals
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT signal");
  gracefulShutdown();
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM signal");
  gracefulShutdown();
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error.message);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});