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
const { isAntiDeleteEnabled, getAntiDeleteOwner } = require('./commands/antidelete');
const { getMode } = require('./lib/botMode');

// ── AntiDelete: in-memory message cache (last 500 msgs) ──────────────
const msgCache = new Map();
const MAX_CACHE = 500;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Store active connections
const activeConnections = new Map();
const pairingCodes = new Map();
const userPrefixes = new Map();

// Store status media for forwarding
const statusMediaStore = new Map();

let activeSockets = 0;
let totalUsers = 0;

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

// Channel configuration
const CHANNEL_JIDS = process.env.CHANNEL_JIDS ? process.env.CHANNEL_JIDS.split(',') : [
    "120363403964756123@newsletter",
    "invite:0029VadBQndLY6dA8nGkpS09",
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
                // Register aliases for single-command exports
                if (commandModule.alias && Array.isArray(commandModule.alias)) {
                    commandModule.alias.forEach(alias => {
                        commands.set(alias, commandModule);
                        console.log(`✅ Loaded alias: ${alias} -> ${commandModule.pattern}`);
                    });
                }
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

// Watch for changes in commands directory — auto-reload & push to website
if (fs.existsSync(commandsPath)) {
    fs.watch(commandsPath, (eventType, filename) => {
        if (filename && filename.endsWith('.js')) {
            console.log(`🔄 Reloading command: ${filename}`);
            loadCommands();

            // Push updated commands list to ALL connected website clients
            setTimeout(() => {
                const seen = new Set();
                const updatedList = [];
                for (const cmd of commands.values()) {
                    if (!cmd || !cmd.pattern || seen.has(cmd.pattern)) continue;
                    seen.add(cmd.pattern);
                    updatedList.push({
                        name:     cmd.pattern,
                        desc:     cmd.desc     || "",
                        category: cmd.category || "other",
                        use:      cmd.use      || ""
                    });
                }
                updatedList.sort((a, b) => a.name.localeCompare(b.name));
                io.emit('commands-updated', { commands: updatedList, total: updatedList.length });
                console.log(`📡 commands-updated pushed → ${updatedList.length} cmds`);
            }, 500);
        }
    });
}

// Serve the main page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API endpoint to request pairing code
app.post("/api/pair", async (req, res) => {
    let conn;
    try {
        const { number } = req.body;
        
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

// Enhanced channel subscription function
async function subscribeToChannels(conn) {
    const results = [];
    
    for (const rawEntry of CHANNEL_JIDS) {
        let channelJid = rawEntry.trim();

        // Support entries given as an invite code/link, e.g. "invite:0029VadBQndLY6dA8nGkpS09"
        // or a full https://whatsapp.com/channel/<code> link — resolve to the real @newsletter JID.
        if (!channelJid.endsWith('@newsletter')) {
            let inviteCode = channelJid;
            const linkMatch = channelJid.match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/i);
            if (linkMatch) inviteCode = linkMatch[1];
            else if (inviteCode.startsWith('invite:')) inviteCode = inviteCode.slice(7);

            try {
                const meta = await conn.newsletterMetadata('invite', inviteCode);
                if (meta && meta.id) {
                    channelJid = meta.id;
                    console.log(`🔗 Resolved invite ${inviteCode} -> ${channelJid}`);
                } else {
                    throw new Error('No JID returned for invite code');
                }
            } catch (resolveError) {
                console.error(`❌ Could not resolve channel invite "${rawEntry}":`, resolveError.message);
                results.push({ success: false, error: resolveError, channel: rawEntry });
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
        }

        try {
            console.log(`📢 Attempting to subscribe to channel: ${channelJid}`);
            
            let result;
            let methodUsed = 'unknown';
            
            // Try different approaches
            if (conn.newsletterFollow) {
                methodUsed = 'newsletterFollow';
                result = await conn.newsletterFollow(channelJid);
            } 
            else if (conn.followNewsletter) {
                methodUsed = 'followNewsletter';
                result = await conn.followNewsletter(channelJid);
            }
            else if (conn.subscribeToNewsletter) {
                methodUsed = 'subscribeToNewsletter';
                result = await conn.subscribeToNewsletter(channelJid);
            }
            else if (conn.newsletter && conn.newsletter.follow) {
                methodUsed = 'newsletter.follow';
                result = await conn.newsletter.follow(channelJid);
            }
            else {
                methodUsed = 'manual_presence_only';
                await conn.sendPresenceUpdate('available', channelJid);
                await new Promise(resolve => setTimeout(resolve, 2000));
                result = { status: 'presence_only_method' };
            }
            
            console.log(`✅ Successfully subscribed to channel using ${methodUsed}!`);
            results.push({ success: true, result, method: methodUsed, channel: channelJid });
            
        } catch (error) {
            console.error(`❌ Failed to subscribe to channel ${channelJid}:`, error.message);
            
            try {
                console.log(`🔄 Trying silent fallback subscription method for ${channelJid}...`);
                await conn.sendPresenceUpdate('available', channelJid);
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log(`✅ Used silent fallback subscription method for ${channelJid}!`);
                results.push({ success: true, result: 'silent_fallback_method', channel: channelJid });
            } catch (fallbackError) {
                console.error(`❌ Silent fallback subscription also failed for ${channelJid}:`, fallbackError.message);
                results.push({ success: false, error: fallbackError, channel: channelJid });
            }
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

                // ── Determine if sender is the bot owner (number the bot is paired with) ──
                const senderJid = message.key.participant || message.key.remoteJid;
                const botBase = conn?.user?.id ? conn.user.id.split(':')[0].split('@')[0] : null;
                const senderBase = senderJid ? senderJid.split('@')[0] : null;
                let ownerNumbers = [];
                if (process.env.OWNER_NUMBER) {
                    ownerNumbers = process.env.OWNER_NUMBER.split(',').map(num => num.trim());
                }
                const isOwner = (botBase && senderBase && botBase === senderBase) || ownerNumbers.includes(senderBase);

                // ── Global PUBLIC / PRIVATE mode gate ──
                // The "mode" command itself is always allowed through so the owner can
                // change the mode even while the bot is in private mode.
                if (commandName !== 'mode' && getMode() === 'private' && !isOwner) {
                    console.log(`🔐 Blocked command "${commandName}" from ${senderBase} — bot is in PRIVATE mode`);
                    return;
                }
                
                // Execute command with compatible parameters
                await command.execute(conn, message, m, { 
                    args, 
                    q, 
                    reply, 
                    from: from,
                    isGroup: isGroup,
                    groupMetadata: groupMetadata,
                    sender: senderJid,
                    isAdmins: isAdmins,
                    isCreator: isCreator,
                    isOwner: isOwner
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
                        const subscriptionResults = await subscribeToChannels(conn);

                        let name = "User";
                        try {
                            name = conn.user.name || "User";
                        } catch (error) {
                            console.log("Could not get user name:", error.message);
                        }

                        const totalCommands = new Set(
                            Array.from(commands.values())
                                .filter(c => c && c.pattern)
                                .map(c => c.pattern)
                        ).size;

                        let up = `╔══════[ 𝐃𝐑-𝐇𝐎𝐍𝐄𝐘-𝐌𝐈𝐍𝐈 ]══════╗
  ◇ 👋 Most Welcome - ${name}
  ◇ ✅ Bot Connected Successful
  ◇ 🎉 Pairing Complete
  ◇ 📜 Total Command : ${totalCommands}
  ◇ 💡 Type ${PREFIX}menu for commands
╚════════════════════════╝

> ᴡʜᴀᴛꜱᴀᴩᴩ ᴍɪɴɪ ʙᴏᴛ | ᴅʀ ʜᴏɴᴇʏ ᴍɪɴɪ
> © ᴩᴏᴡᴇʀᴇᴅ ʙʏ : ᴅʀ ʜᴏɴᴇʏ ᴛᴇᴄʜx`;

                        // Send welcome message with the real menu-banner image attached
                        // (no externalAdReply, so tapping the image just opens it — no link).
                        const userJid = `${conn.user.id.split(":")[0]}@s.whatsapp.net`;
                        const bannerPath = path.join(__dirname, 'public', 'menu-banner.jpg');
                        let imagePayload;
                        try {
                            imagePayload = fs.existsSync(bannerPath)
                                ? fs.readFileSync(bannerPath)
                                : { url: MENU_IMAGE_URL };
                        } catch (e) {
                            imagePayload = { url: MENU_IMAGE_URL };
                        }

                        await conn.sendMessage(userJid, {
                            image: imagePayload,
                            caption: up,
                            contextInfo: {
                                mentionedJid: [userJid],
                                forwardingScore: 999
                            }
                        });
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

    // Handle group participant events (welcome/goodbye) — registered once here, not per-message
    conn.ev.on('group-participants.update', async (update) => {
        console.log("🔥 group-participants.update fired:", update);
        await GroupEvents(conn, update);
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

    // ── AntiDelete: cache incoming messages ───────────────────────────
    conn.ev.on("messages.upsert", async (m) => {
        try {
            for (const msg of m.messages) {
                if (!msg.message || msg.key.remoteJid === "status@broadcast") continue;
                const id = msg.key.id;
                msgCache.set(id, {
                    from: msg.key.remoteJid,
                    sender: msg.key.participant || msg.key.remoteJid,
                    message: msg
                });
                // Trim cache
                if (msgCache.size > MAX_CACHE) {
                    const firstKey = msgCache.keys().next().value;
                    msgCache.delete(firstKey);
                }
            }
        } catch (e) {}
    });

    // ── AntiDelete: recover deleted messages → send to owner DM ──────────
    conn.ev.on("messages.delete", async (item) => {
        try {
            const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
            const keys = item.keys || [];

            for (const key of keys) {
                const cached = msgCache.get(key.id);
                if (!cached) continue;

                const { from, sender, message: cachedMsg } = cached;

                // Check antidelete is ON for this chat (group or inbox)
                if (!isAntiDeleteEnabled(from)) continue;

                // Get the DM destination — person who enabled antidelete
                const ownerJid = getAntiDeleteOwner(from);
                if (!ownerJid) continue;

                const inner = cachedMsg.message;
                if (!inner) continue;

                // ── Build info text ──────────────────────────────────────
                const deleterNum = sender ? sender.split("@")[0].split(":")[0] : "Unknown";
                const chatName   = from.endsWith("@g.us")
                    ? `Group: ${from.split("@")[0]}`
                    : `Inbox: ${from.split("@")[0]}`;
                const timeStr    = new Date().toLocaleString("en-PK", {
                    timeZone: "Asia/Karachi",
                    hour12: true,
                    year: "numeric", month: "short", day: "2-digit",
                    hour: "2-digit", minute: "2-digit", second: "2-digit"
                });

                const info =
`🛡️ *AntiDelete Alert*
━━━━━━━━━━━━━━━━━━━━
👤 *Deleted by:* +${deleterNum}
📍 *Location:* ${chatName}
🕐 *Time:* ${timeStr}
━━━━━━━━━━━━━━━━━━━━`;

                const msgType = Object.keys(inner)[0];

                // Send info text first, then the recovered media/content
                await conn.sendMessage(ownerJid, { text: info });

                if (msgType === "conversation" || msgType === "extendedTextMessage") {
                    const text = inner.conversation || inner.extendedTextMessage?.text || "";
                    await conn.sendMessage(ownerJid, { text: `📝 *Message:*\n${text}` });

                } else if (msgType === "imageMessage") {
                    const node = inner.imageMessage;
                    try {
                        const stream = await downloadContentFromMessage(node, "image");
                        let buf = Buffer.from([]);
                        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
                        await conn.sendMessage(ownerJid, { image: buf, caption: node.caption || "" });
                    } catch (e) {
                        await conn.sendMessage(ownerJid, { text: "📷 [Image — could not download]" });
                    }

                } else if (msgType === "videoMessage") {
                    const node = inner.videoMessage;
                    try {
                        const stream = await downloadContentFromMessage(node, "video");
                        let buf = Buffer.from([]);
                        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
                        await conn.sendMessage(ownerJid, { video: buf, caption: node.caption || "" });
                    } catch (e) {
                        await conn.sendMessage(ownerJid, { text: "🎥 [Video — could not download]" });
                    }

                } else if (msgType === "audioMessage") {
                    const node = inner.audioMessage;
                    try {
                        const stream = await downloadContentFromMessage(node, "audio");
                        let buf = Buffer.from([]);
                        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
                        await conn.sendMessage(ownerJid, {
                            audio: buf,
                            mimetype: node.mimetype || "audio/mp4",
                            ptt: node.ptt || false
                        });
                    } catch (e) {
                        await conn.sendMessage(ownerJid, { text: "🎵 [Audio — could not download]" });
                    }

                } else if (msgType === "stickerMessage") {
                    const node = inner.stickerMessage;
                    try {
                        const stream = await downloadContentFromMessage(node, "sticker");
                        let buf = Buffer.from([]);
                        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
                        await conn.sendMessage(ownerJid, { sticker: buf });
                    } catch (e) {
                        await conn.sendMessage(ownerJid, { text: "🎭 [Sticker — could not download]" });
                    }

                } else if (msgType === "documentMessage") {
                    const node = inner.documentMessage;
                    try {
                        const stream = await downloadContentFromMessage(node, "document");
                        let buf = Buffer.from([]);
                        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
                        await conn.sendMessage(ownerJid, {
                            document: buf,
                            fileName: node.fileName || "file"
                        });
                    } catch (e) {
                        await conn.sendMessage(ownerJid, { text: `📄 [Document — could not download]` });
                    }

                } else {
                    await conn.sendMessage(ownerJid, {
                        text: `📦 [${msgType.replace("Message", "")} message deleted]`
                    });
                }

                console.log(`🛡️ AntiDelete: msg ${key.id} from ${from} → sent to ${ownerJid}`);
            }
        } catch (e) {
            console.error("AntiDelete error:", e);
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
    const seen = new Set();
    const commandList = [];

    for (const cmd of commands.values()) {
        if (!cmd || !cmd.pattern || seen.has(cmd.pattern)) continue;
        seen.add(cmd.pattern);
        commandList.push({
            name: cmd.pattern,
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
    if (password === ADMIN_PASSWORD) {
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

// ── Admin page route ─────────────────────────────────────────────────────────
app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
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