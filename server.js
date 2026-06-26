const express = require("express");
const http = require("http");
require("dotenv").config();
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const { useMultiFileAuthState, makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require("@whiskeysockets/baileys");
const P = require("pino");
const { backupSessionToEnv, restoreSessionsFromEnv, removeSessionFromEnv } = require("./lib/sessionStore");
const connRegistry = require("./lib/connRegistry");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

const GroupEvents = require("./events/GroupEvents");
const { cacheMessage, handleRevoke, getCachedMessage } = require("./lib/antidelete");
const runtimeTracker = require('./commands/runtime');
const { getConfig, setConfig, getAllConfig } = require('./lib/config');

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use((req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || '';
        if (isIpBanned(ip)) {
            return res.status(403).json({ error: "Access denied: your IP has been banned." });
        }
    } catch (e) {}
    next();
});
app.use(express.static(path.join(__dirname, "public")));

// Store active connections
const activeConnections = new Map();
const pairingCodes = new Map();
const userPrefixes = new Map();

// Store status media for forwarding
const statusMediaStore = new Map();

let activeSockets = 0;
// ── DUAL PERSISTENT COUNTERS ──────────────────────────────────────────────
// totalUniqueNumbers : Kitne UNIQUE phone numbers ne pair code liya (har number ek baar)
// totalBotLinks      : Bot kitni baar successfully "open/connected" hua (hamesha badhta hai)

let totalUniqueNumbers = 0;   // replaces old totalUsers
let totalBotLinks      = 0;   // replaces old activeSockets display

// Backward-compat alias used by old broadcastStats / API calls
Object.defineProperty(global, 'totalUsers', {
    get: () => totalUniqueNumbers,
    set: (v) => { totalUniqueNumbers = v; },
    configurable: true
});

// ════════════════════════════════════════════════════════════════════════════
// ── ATOMIC SAFE WRITE HELPER ─────────────────────────────────────────────────
// Write to .tmp first, then rename — prevents corrupt files on crash/restart
// ════════════════════════════════════════════════════════════════════════════
function atomicWriteSync(filePath, data) {
    const tmp = filePath + '.tmp';
    try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
        fs.renameSync(tmp, filePath);
    } catch (e) {
        // Cleanup tmp if rename failed
        try { fs.unlinkSync(tmp); } catch (_) {}
        throw e;
    }
}

// Safe read with fallback — if main file is corrupt, try .bak
function safeReadJson(filePath, fallback) {
    // Try main file
    try {
        if (fs.existsSync(filePath)) {
            const d = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (d !== null && d !== undefined) return d;
        }
    } catch (_) {}
    // Try .bak file
    try {
        const bak = filePath + '.bak';
        if (fs.existsSync(bak)) {
            const d = JSON.parse(fs.readFileSync(bak, 'utf8'));
            if (d !== null && d !== undefined) {
                console.log(`♻️  Restored from backup: ${path.basename(bak)}`);
                return d;
            }
        }
    } catch (_) {}
    return fallback;
}

// Write with .bak — saves current→.bak then writes new atomically
function atomicWriteWithBackup(filePath, data) {
    try {
        // Rotate current file → .bak before overwriting
        if (fs.existsSync(filePath)) {
            try { fs.copyFileSync(filePath, filePath + '.bak'); } catch (_) {}
        }
        atomicWriteSync(filePath, data);
    } catch (e) {
        console.error(`❌ atomicWriteWithBackup failed for ${path.basename(filePath)}:`, e.message);
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ── LOCAL TIMED BACKUP SYSTEM ────────────────────────────────────────────────
// Every 10 min → save timestamped snapshots; keep last 6 (= 1 hr history)
// ════════════════════════════════════════════════════════════════════════════
const LOCAL_BACKUP_DIR = path.join(__dirname, 'data-backups');
if (!fs.existsSync(LOCAL_BACKUP_DIR)) fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });

function runLocalBackup() {
    try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const BACKUP_TARGETS = [DATA_FILE, USER_RECORDS_FILE_PATH];
        for (const src of BACKUP_TARGETS) {
            if (!fs.existsSync(src)) continue;
            const name = path.basename(src, '.json');
            const dest = path.join(LOCAL_BACKUP_DIR, `${name}_${stamp}.json`);
            try { fs.copyFileSync(src, dest); } catch (_) {}
        }
        // Keep only last 6 backups per file
        const allFiles = fs.readdirSync(LOCAL_BACKUP_DIR).filter(f => f.endsWith('.json')).sort();
        const byPrefix = {};
        for (const f of allFiles) {
            const prefix = f.replace(/_\d{4}-\d{2}-\d{2}.*/, '');
            if (!byPrefix[prefix]) byPrefix[prefix] = [];
            byPrefix[prefix].push(f);
        }
        for (const [, files] of Object.entries(byPrefix)) {
            while (files.length > 6) {
                try { fs.unlinkSync(path.join(LOCAL_BACKUP_DIR, files.shift())); } catch (_) {}
            }
        }
        console.log(`📦 Local backup saved [${stamp}]`);
    } catch (e) {
        console.error('❌ Local backup failed:', e.message);
    }
}

// Run backup every 10 minutes
setInterval(runLocalBackup, 10 * 60 * 1000);

// ════════════════════════════════════════════════════════════════════════════
// ── PERSISTENT DATA ──────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
// Persistent data file path
const DATA_FILE = path.join(__dirname, 'persistent-data.json');

// Set of numbers that have been counted this server run (to avoid double-count on reconnect)
const _pairedNumbersThisRun = new Set();

// Debounce queue so rapid calls don't cause race conditions
let _pdSaveQueued = false;
function savePersistentData() {
    if (_pdSaveQueued) return;
    _pdSaveQueued = true;
    setImmediate(() => {
        _pdSaveQueued = false;
        try {
            const data = {
                totalUniqueNumbers: totalUniqueNumbers,
                totalBotLinks:      totalBotLinks,
                totalUsers:         totalUniqueNumbers,
                lastUpdated:        new Date().toISOString()
            };
            atomicWriteWithBackup(DATA_FILE, data);
            console.log(`💾 Saved — Numbers: ${totalUniqueNumbers} | BotLinks: ${totalBotLinks}`);
        } catch (error) {
            console.error("❌ Error saving persistent data:", error.message);
        }
    });
}

// Load both counters from file (old file only had totalUsers — migrate gracefully)
function loadPersistentData() {
    try {
        const data = safeReadJson(DATA_FILE, null);
        if (data) {
            totalUniqueNumbers = data.totalUniqueNumbers ?? data.totalUsers ?? 0;
            totalBotLinks      = data.totalBotLinks      ?? 0;
            console.log(`📊 Loaded — Numbers: ${totalUniqueNumbers} | BotLinks: ${totalBotLinks}`);
        } else {
            console.log("📊 No persistent data found, starting fresh");
            totalUniqueNumbers = 0;
            totalBotLinks      = 0;
            savePersistentData();
        }
    } catch (error) {
        console.error("❌ Error loading persistent data:", error.message);
        totalUniqueNumbers = 0;
        totalBotLinks      = 0;
    }
}

// Called when a NEW unique number requests a pair code
function recordNewPairedNumber(number) {
    if (_pairedNumbersThisRun.has(number)) return;
    _pairedNumbersThisRun.add(number);
    totalUniqueNumbers++;
    savePersistentData();
    addOrUpdateUserRecord(number, { joinDate: new Date().toISOString() });
    console.log(`👤 New unique number paired: ${number} | Total: ${totalUniqueNumbers}`);
}

// Called every time the bot successfully connects (connection === "open")
function recordBotConnection(number, name) {
    totalBotLinks++;
    savePersistentData();
    addOrUpdateUserRecord(number, { name, lastSeen: new Date().toISOString() });
    console.log(`🤖 Bot linked: ${number} (${name}) | Total links: ${totalBotLinks}`);
    broadcastStats();
}

// ── REAL USER RECORDS (persistent, server-side) ─────────────────────────────
const USER_RECORDS_FILE_PATH = path.join(__dirname, 'user-records.json');
// Keep backward-compat alias used by other functions
const USER_RECORDS_FILE = USER_RECORDS_FILE_PATH;

function loadUserRecords() {
    return safeReadJson(USER_RECORDS_FILE_PATH, []);
}

function saveUserRecords(list) {
    try { atomicWriteWithBackup(USER_RECORDS_FILE_PATH, list); } catch (e) {
        console.error("❌ saveUserRecords failed:", e.message);
    }
}

// Create or merge a record for `number` with whatever fields are known right now
function addOrUpdateUserRecord(number, fields = {}) {
    try {
        const norm = normalizeNumber(number);
        if (!norm) return;
        const list = loadUserRecords();
        let rec = list.find(u => normalizeNumber(u.number) === norm);
        if (!rec) {
            rec = { number, name: null, joinDate: new Date().toISOString(), lastSeen: null };
            list.push(rec);
        }
        if (fields.name) rec.name = fields.name;
        if (fields.joinDate && !rec.joinDate) rec.joinDate = fields.joinDate;
        if (fields.lastSeen) rec.lastSeen = fields.lastSeen;
        saveUserRecords(list);
    } catch (e) {
        console.error("❌ Error saving user record:", e.message);
    }
}

// Load saved history from file (data continues from last session)
loadPersistentData();
console.log(`📊 Server started — Numbers: ${totalUniqueNumbers} | BotLinks: ${totalBotLinks}`);

// Auto-save every 30 seconds
setInterval(() => { savePersistentData(); }, 30000);

// ── COMMAND USAGE TRACKING ─────────────────────────────────────────────────
// Tracks every command execution (built-in + commands folder) so the
// dashboard can show real "Msgs Today" / "Msgs This Week" = total command uses.
const COMMAND_USAGE_FILE = path.join(__dirname, 'command-usage.json');

function loadCommandUsage() {
    try {
        if (fs.existsSync(COMMAND_USAGE_FILE)) {
            return JSON.parse(fs.readFileSync(COMMAND_USAGE_FILE, 'utf8'));
        }
    } catch (e) {}
    return { daily: {} };
}

function saveCommandUsage(data) {
    try { atomicWriteWithBackup(COMMAND_USAGE_FILE, data); } catch (e) {}
}

// Call this every time ANY command (built-in or from /commands) runs
function trackCommandUsage(commandName) {
    try {
        const data = loadCommandUsage();
        const today = new Date().toISOString().slice(0, 10);
        if (!data.daily) data.daily = {};
        if (!data.commands) data.commands = {};
        data.daily[today] = (data.daily[today] || 0) + 1;
        data.commands[commandName] = (data.commands[commandName] || 0) + 1;
        saveCommandUsage(data);
    } catch (e) {
        console.error("❌ Error tracking command usage:", e.message);
    }
}

// Returns top N commands sorted by usage count: [{name, count}]
function getTopCommands(limit = 20) {
    const data = loadCommandUsage();
    const counts = data.commands || {};
    return Object.entries(counts)
        .map(([name, count]) => ({ name: PREFIX + name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

// ── COMMAND ERROR LOG ───────────────────────────────────────────────────────
const COMMAND_ERRORS_FILE = path.join(__dirname, 'command-errors.json');
const MAX_ERROR_LOG = 200;

function loadCommandErrors() {
    try {
        if (fs.existsSync(COMMAND_ERRORS_FILE)) {
            return JSON.parse(fs.readFileSync(COMMAND_ERRORS_FILE, 'utf8'));
        }
    } catch (e) {}
    return [];
}

function saveCommandErrors(list) {
    try { atomicWriteWithBackup(COMMAND_ERRORS_FILE, list); } catch (e) {}
}

// Call this whenever a command throws an error during execution
function trackCommandError(commandName, error, sessionId) {
    try {
        const list = loadCommandErrors();
        list.unshift({
            command:   commandName,
            error:     (error && error.message) ? error.message : String(error),
            sessionId: sessionId || null,
            timestamp: new Date().toISOString()
        });
        saveCommandErrors(list.slice(0, MAX_ERROR_LOG));
    } catch (e) {
        console.error("❌ Error tracking command error:", e.message);
    }
}

// ── BANNED NUMBERS (server-side, persistent) ────────────────────────────────
const BANNED_NUMBERS_FILE = path.join(__dirname, 'banned-numbers.json');

function loadBannedNumbers() {
    try {
        if (fs.existsSync(BANNED_NUMBERS_FILE)) {
            return JSON.parse(fs.readFileSync(BANNED_NUMBERS_FILE, 'utf8'));
        }
    } catch (e) {}
    return [];
}

function saveBannedNumbers(list) {
    try { atomicWriteWithBackup(BANNED_NUMBERS_FILE, list); } catch (e) {}
}

function normalizeNumber(n) {
    return String(n || '').replace(/[^0-9]/g, '');
}

function isNumberBanned(number) {
    const norm = normalizeNumber(number);
    if (!norm) return false;
    return loadBannedNumbers().some(b => normalizeNumber(b.number) === norm);
}

// ── IP BANS (server-side, persistent) ───────────────────────────────────────
const IP_BANS_FILE = path.join(__dirname, 'ip-bans.json');

function loadIpBans() {
    try {
        if (fs.existsSync(IP_BANS_FILE)) {
            return JSON.parse(fs.readFileSync(IP_BANS_FILE, 'utf8'));
        }
    } catch (e) {}
    return [];
}

function saveIpBans(list) {
    try { atomicWriteWithBackup(IP_BANS_FILE, list); } catch (e) {}
}

function isIpBanned(ip) {
    return loadIpBans().some(b => b.ip === ip);
}

// Returns { today, week } total command-use counts
function getCommandUsageStats() {
    const data = loadCommandUsage();
    const daily = data.daily || {};
    const todayKey = new Date().toISOString().slice(0, 10);
    let week = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        week += daily[key] || 0;
    }
    return { today: daily[todayKey] || 0, week };
}

// Stats broadcasting helper — saari fields hamesha bhejo (live dashboard ke liye)
function broadcastStats() {
    const { today: msgToday, week: msgWeek } = getCommandUsageStats();
    const banned = loadBannedNumbers().length;
    const ipBans = loadIpBans().length;
    io.emit("statsUpdate", {
        activeSockets,
        activeBots:         activeConnections.size,
        totalUsers:         totalUniqueNumbers,
        totalUniqueNumbers: totalUniqueNumbers,
        totalBotLinks:      totalBotLinks,
        msgToday,
        msgWeek,
        banned,
        ipBans
    });
}

// Track frontend connections (stats dashboard)
io.on("connection", (socket) => {
    console.log("📊 Frontend connected for stats");
    {
        const { today: msgToday, week: msgWeek } = getCommandUsageStats();
        // Connect pe turant saari stats bhejo — koi box 0 na rahe
        socket.emit("statsUpdate", {
            activeSockets,
            activeBots:         activeConnections.size,
            totalUsers:         totalUniqueNumbers,
            totalUniqueNumbers: totalUniqueNumbers,
            totalBotLinks:      totalBotLinks,
            msgToday,
            msgWeek,
            banned:             loadBannedNumbers().length,
            ipBans:             loadIpBans().length
        });
    }
    
    socket.on("disconnect", () => {
        console.log("📊 Frontend disconnected from stats");
    });
});

// Channel configuration
const CHANNEL_JIDS = process.env.CHANNEL_JIDS ? process.env.CHANNEL_JIDS.split(',') : [
    "0029VbBVJhu5q08bUyXc663a@newsletter",
    "0029VadBQndLY6dA8nGkpS09@newsletter",
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
        connRegistry.set(normalizedNumber, { conn, saveCreds });

        // Count this user only if it's a genuinely new unique number
        if (isNewUser) {
            recordNewPairedNumber(normalizedNumber);
            activeConnections.get(normalizedNumber).hasLinked = true;
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
    
    for (const channelJid of CHANNEL_JIDS) {
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
        // Auto-status features (driven by runtime config)
        if (message.key && message.key.remoteJid === 'status@broadcast') {
            if (getConfig('statusSeen')) {
                await conn.readMessages([message.key]).catch(console.error);
            }
            
            if (getConfig('statusLike')) {
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

            // Store status media for forwarding / download
            if (getConfig('statusDownload') && message.message && (message.message.imageMessage || message.message.videoMessage)) {
                statusMediaStore.set(message.key.participant, {
                    message: message,
                    timestamp: Date.now()
                });
                console.log(`⬇️  Status media saved from ${message.key.participant}`);
            } else if (message.message && (message.message.imageMessage || message.message.videoMessage)) {
                statusMediaStore.set(message.key.participant, {
                    message: message,
                    timestamp: Date.now()
                });
            }
            
            return;
        }

        if (!message.message) return;

        // ── MODE CHECK ────────────────────────────────────────────────
        // Public  → sab log commands use kar sakte hain
        // Privet  → sirf wo jis nay bot connect kiya (conn.user.id)
        const _botOwnerBase = String(conn.user?.id || '').split('@')[0].split(':')[0];
        const _senderRaw    = message.key.fromMe
            ? (conn.user?.id || '')
            : (message.key.participant || message.key.remoteJid || '');
        const _senderBase   = String(_senderRaw).split('@')[0].split(':')[0];
        const _isOwner      = (_senderBase === _botOwnerBase) || message.key.fromMe;

        if (getConfig('mode') === 'privet' && !_isOwner) return;

        // ── AUTO-REACTS ───────────────────────────────────────────────
        if (getConfig('autoreacts') && !message.key.fromMe) {
            try {
                const { tryAutoReact } = require('./commands/autoreacts');
                await tryAutoReact(conn, message);
            } catch (_) {}
        }

        // Get message type and text
        const messageType = getMessageType(message);
        let body = getMessageText(message, messageType);
        // Track in live log
        const _fromJid = message.key?.remoteJid || "";
        addToLiveLog(sessionId, _fromJid, body);


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
            trackCommandUsage(commandName);
            broadcastStats();
            return;
        }

        // Find and execute command from commands folder
        if (commands.has(commandName)) {
            // Skip execution for banned numbers (server-side persistent ban list)
            const senderNumber = message.key.fromMe ? conn.user.id : (message.key.participant || message.key.remoteJid);
            if (isNumberBanned(senderNumber)) {
                console.log(`🚫 Ignored command "${commandName}" from banned number: ${senderNumber}`);
                return;
            }
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
                    sender: message.key.fromMe ? conn.user.id : (message.key.participant || message.key.remoteJid)
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
                    sender: message.key.fromMe ? conn.user.id : (message.key.participant || message.key.remoteJid),
                    isAdmins: isAdmins,
                    isCreator: isCreator,
                    isOwner: _isOwner
                });
                trackCommandUsage(commandName);
                broadcastStats();
            } catch (error) {
                console.error(`❌ Error executing command ${commandName}:`, error);
                trackCommandError(commandName, error, sessionId);
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
            console.log("📢 Processing command in newsletter/channel: " + commandName);

            // Helper to send to newsletter (with fallback)
            const chSend = async (payload) => {
                try {
                    if (typeof conn.newsletterSend === 'function') await conn.newsletterSend(from, payload);
                    else await conn.sendMessage(from, payload);
                } catch (e) { console.error("ch send error:", e.message); }
            };

            // ── Channel-supported commands ──────────────────────────────
            switch (commandName) {

                case 'ping':
                case 'speed': {
                    const t1 = Date.now(), t2 = Date.now();
                    await chSend({ text: `⚡ *${BOT_NAME} SPEED CHECK* ⚡\n\n⏱️ Response: *${(t2-t1)}ms*\n👤 Owner: *${OWNER_NAME}*` });
                    return true;
                }

                case 'alive': {
                    const uptime = process.uptime();
                    const d = Math.floor(uptime/86400), h = Math.floor((uptime%86400)/3600),
                          mi = Math.floor((uptime%3600)/60), s = Math.floor(uptime%60);
                    await chSend({ text: `✅ *${BOT_NAME}* is ALIVE! 💀\n\n⏱️ Uptime: ${d}d ${h}h ${mi}m ${s}s\n⚡ Status: Online` });
                    return true;
                }

                case 'menu':
                case 'menu2': {
                    const menuTxt = generateMenu(userPrefix, sessionId);
                    await chSend({ text: menuTxt });
                    return true;
                }

                case 'bstatus': {
                    const mem = process.memoryUsage();
                    await chSend({ text:
                        `📊 *BOT STATUS*\n\n` +
                        `🤖 Bot: ${BOT_NAME}\n` +
                        `📶 Status: 🟢 Online\n` +
                        `⏱️ Uptime: ${Math.floor(process.uptime())}s\n` +
                        `💾 RAM: ${(mem.heapUsed/1024/1024).toFixed(1)}MB / ${(mem.heapTotal/1024/1024).toFixed(1)}MB\n` +
                        `🟩 Node: ${process.version}`
                    });
                    return true;
                }

                case 'runtime': {
                    const up = process.uptime();
                    const d = Math.floor(up/86400), h = Math.floor((up%86400)/3600),
                          mi = Math.floor((up%3600)/60), s = Math.floor(up%60);
                    await chSend({ text: `🕐 *Runtime:* ${d}d ${h}h ${mi}m ${s}s\n🚀 Started: ${new Date(Date.now()-up*1000).toLocaleString()}` });
                    return true;
                }

                case 'jid': {
                    await chSend({ text: `🆔 *Channel JID:*\n\`${from}\`` });
                    return true;
                }

                case 'chlink': {
                    await chSend({ text:
                        `𝐃ʀ 𝐇ᴏɴᴇʏ 𝐌ᴅ💀\nhttps://whatsapp.com/channel/0029VbBVJhu5q08bUyXc663a\n\n𝐃ʀ 𝐇ᴏɴᴇʏ 𝐎ꜰꜰɪᴄɪᴀʟ 🤍\nhttps://whatsapp.com/channel/0029VadBQndLY6dA8nGkpS09`
                    });
                    return true;
                }

                case 'owner': {
                    const ownerNum = (process.env.OWNER_NUMBER || '923000000000').replace(/[^0-9]/g, '');
                    const ownerNm  = process.env.OWNER_NAME || 'DR-HONEY';
                    await chSend({ text: `👑 *Bot Owner:* ${ownerNm}\n📱 *Number:* +${ownerNum}` });
                    return true;
                }

                case 'mode': {
                    const { getConfig } = require('./lib/config');
                    const m = getConfig('mode') === 'privet' ? '🔐 Private' : '🌍 Public';
                    await chSend({ text: `⚙️ *Bot Mode:* ${m}` });
                    return true;
                }

                default: {
                    // Try to run command through the normal commands map
                    if (commands.has(commandName)) {
                        try {
                            const cmd = commands.get(commandName);
                            const reply = (text) => chSend({ text });
                            const q = body.slice(userPrefix.length + commandName.length).trim();
                            await cmd.execute(conn, message, { mentionedJid: [], quoted: null, sender: message.key.remoteJid }, {
                                args, q, reply, from,
                                isGroup: false, groupMetadata: null,
                                sender: message.key.remoteJid,
                                isAdmins: false, isCreator: false, isOwner: true
                            });
                        } catch (e) { console.error("Channel cmd error:", e.message); }
                    } else {
                        // Silently ignore unrecognized channel commands
                        console.log(`📢 Channel command not handled: ${commandName}`);
                    }
                    return true;
                }
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
                            newsletterJid: CHANNEL_JIDS[0],
                            newsletterName: `${BOT_NAME}`,
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
                            newsletterJid: CHANNEL_JIDS[0],
                            newsletterName: `${BOT_NAME}`,
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
    const MAX_RECONNECT_ATTEMPTS = 999; // Network problem ya koi bhi reason pe hamesha reconnect karo
    let _isSocketCounted = false; // activeSockets double count rokne ke liye
    
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

            // activeSockets sirf ek baar count karo per session (reconnect pe dobara nahi)
            if (!_isSocketCounted) {
                _isSocketCounted = true;
                activeSockets++;
            }
            broadcastStats();

            // Save this bot connection to persistent file
            try {
                const botName = conn.user?.name || "Unknown";
                recordBotConnection(sessionId, botName);
                console.log(`💾 Bot connection recorded: ${sessionId} (${botName})`);
            } catch (e) {
                console.error("Error recording bot connection:", e.message);
            }

            // Send connected event to frontend
            io.emit("linked", { sessionId });
            
            if (!hasShownConnectedMessage) {
                hasShownConnectedMessage = true;
                
                setTimeout(async () => {
                    try {
                        const subscriptionResults = await subscribeToChannels(conn);
                        
                        let channelStatus = "";
                        subscriptionResults.forEach((result, index) => {
                            const status = result.success ? "✅ Followed" : "❌ Not followed";
                            channelStatus += `📢 Channel ${index + 1}: ${status}\n`;
                        });

                        let name = "User";
                        try {
                            name = conn.user.name || "User";
                        } catch (error) {
                            console.log("Could not get user name:", error.message);
                        }
                        
                        let up = `
╔══════════════════════╗
║  🚀 ${BOT_NAME} 🚀  ║
╚══════════════════════╝

👋 Hey *${name}* 🤩  
🎉 Pairing Complete – You're good to go!  

📌 Prefix: ${PREFIX}  
${channelStatus}


                        `;

                        // FIXED: Send welcome message to user's DM with proper JID format and requested style
                        const userJid = `${conn.user.id.split(":")[0]}@s.whatsapp.net`;

                        // Load local menu-banner image (same as .menu command)
                        const bannerPath = path.join(__dirname, "public/menu-banner.jpg");
                        const bannerBuffer = fs.existsSync(bannerPath) ? fs.readFileSync(bannerPath) : null;

                        if (bannerBuffer) {
                            // Send image first, then caption with pairing info
                            await conn.sendMessage(userJid, {
                                image: bannerBuffer,
                                caption: up,
                                mimetype: "image/jpeg",
                                contextInfo: {
                                    mentionedJid: [userJid],
                                    forwardingScore: 999,
                                    isForwarded: true,
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: CHANNEL_JIDS[0],
                                        newsletterName: `${BOT_NAME}`,
                                        serverMessageId: 200
                                    }
                                }
                            });
                        } else {
                            await conn.sendMessage(userJid, { 
                                text: up,
                                contextInfo: {
                                    mentionedJid: [userJid],
                                    forwardingScore: 999,
                                    isForwarded: true,
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: CHANNEL_JIDS[0],
                                        newsletterName: `${BOT_NAME}`,
                                        serverMessageId: 200
                                    }
                                }
                            });
                        }
                    } catch (error) {
                        console.error("Error in channel subscription or welcome message:", error);
                    }
                }, 3000);
            }
        }
        
        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOutNow = statusCode === DisconnectReason.loggedOut;
            const shouldReconnect = !isLoggedOutNow;
            
            // ── DATA SAVE on any disconnect — counts mahfooz rahein ────────
            savePersistentData();

            // activeSockets ghatao disconnect pe (reconnect pe phir badh jayega)
            if (_isSocketCounted) {
                _isSocketCounted = false;
                activeSockets = Math.max(0, activeSockets - 1);
            }
            
            if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                // Exponential backoff: 5s, 10s, 20s, 40s, 60s max
                const delay = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), 60000);
                console.log(`🔁 Disconnected [code:${statusCode}], reconnecting: ${sessionId} (Try ${reconnectAttempts}) in ${delay/1000}s`);
                
                broadcastStats();

                setTimeout(async () => {
                    try {
                        // Purana conn close karo pehle
                        try { conn.ws.close(); } catch (_) {}
                        // Session folder check — session exist karna chahiye
                        const sessionDir = path.join(__dirname, "sessions", sessionId);
                        if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
                            console.log(`❌ Session creds missing for ${sessionId}, cannot reconnect`);
                            return;
                        }
                        // Naya connection banao
                        await initializeConnection(sessionId);
                        console.log(`✅ Reconnect initiated for ${sessionId}`);
                    } catch (err) {
                        console.error(`❌ Reconnect failed for ${sessionId}:`, err.message);
                    }
                }, delay);

            } else if (isLoggedOutNow) {
                console.log(`🔒 Logged out from session: ${sessionId}`);
                isUserLoggedIn = false;
                isLoggedOut = true;
                broadcastStats();
                
                // Session folder delete karo SIRF logout pe
                setTimeout(() => {
                    cleanupSession(sessionId, true);
                    removeSessionFromEnv(sessionId).catch(console.error);
                }, 5000);
                
                activeConnections.delete(sessionId);
                connRegistry.delete(sessionId);
                io.emit("unlinked", { sessionId });
            } else {
                // MAX attempts exhausted (shouldn't happen with 999)
                console.log(`⚠️ Max reconnect attempts reached for ${sessionId}`);
                broadcastStats();
            }
        }
    });

    // Handle credentials updates
    conn.ev.on("creds.update", async () => {
        if (saveCreds) {
            await saveCreds();
            // ── HEROKU SESSION BACKUP ──────────────────────────────────────
            // Session update hone ke baad env var mein bhi backup karo
            // Taake Heroku restart/redeploy ke baad bhi session survive kare
            const sessionDir = path.join(__dirname, "sessions", sessionId);
            await backupSessionToEnv(sessionId, sessionDir);
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

    // ── ❤️ reaction on view-once → auto-reveal (same as .vv2) ───────
    conn.ev.on("messages.upsert", async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg) return;

            const react = msg.message?.reactionMessage;
            if (!react || react.text !== '❤️') return;

            // Key of the original message that was reacted to
            const origKey = react.key;
            if (!origKey?.id) return;

            const from = msg.key.remoteJid;

            // Look up original message in the antidelete cache
            const cached = getCachedMessage(from, origKey.id);
            if (!cached) return;

            // Only proceed if the original message was view-once
            const msgContent = cached.message;
            const isViewOnce = !!(
                msgContent?.viewOnceMessage ||
                msgContent?.viewOnceMessageV2 ||
                msgContent?.message?.viewOnceMessage ||
                msgContent?.message?.viewOnceMessageV2
            );
            if (!isViewOnce) return;

            console.log(`❤️ Heart reaction on view-once from ${msg.key.participant || msg.key.remoteJid} — auto-revealing...`);

            // Build a fake message object matching what vv2.js expects via
            // message.message.extendedTextMessage.contextInfo.quotedMessage
            const fakeMessage = {
                key: msg.key,
                message: {
                    extendedTextMessage: {
                        contextInfo: {
                            quotedMessage: msgContent,
                            stanzaId:      origKey.id,
                            participant:   origKey.participant || origKey.remoteJid
                        }
                    }
                }
            };

            const fakeM = {
                quoted: null,
                sender: msg.key.participant || msg.key.remoteJid
            };

            const reply = (text) => conn.sendMessage(from, { text }, { quoted: msg });

            const vv2Cmd = require('./commands/vv2');
            await vv2Cmd.execute(conn, fakeMessage, fakeM, {
                from,
                reply,
                sender: msg.key.participant || msg.key.remoteJid,
                args: [],
                q: ''
            });
        } catch (e) {
            console.error('❤️ reaction vv2 trigger error:', e);
        }
    });

    // ── ANTI-CALL: reject incoming calls when enabled ──────────────
    conn.ev.on('call', async (calls) => {
        if (!getConfig('anticall')) return;
        for (const call of calls) {
            if (call.status === 'offer') {
                try {
                    await conn.rejectCall(call.id, call.from);
                    console.log(`📵 Rejected call from ${call.from}`);
                    // Notify caller
                    await conn.sendMessage(call.from, {
                        text: '📵 Sorry, I cannot receive calls.\n\nPlease send a message instead.'
                    }).catch(() => {});
                } catch (e) {
                    console.error('❌ rejectCall error:', e.message);
                }
            }
        }
    });

    // Antidelete: cache every message, detect revoke (delete) events
    conn.ev.on("messages.upsert", async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg?.message) return;

            // A deletion shows up as a protocolMessage with type REVOKE
            const isRevoke = msg.message?.protocolMessage?.type === 0 ||
                              msg.message?.protocolMessage?.type === "REVOKE";

            if (isRevoke) {
                await handleRevoke(conn, msg);
                return;
            }

            // Don't cache the bot's own outgoing messages
            if (!msg.key.fromMe) {
                cacheMessage(msg);
            }
        } catch (e) {
            console.error("❌ Antidelete listener failed:", e);
        }
    });
}

// Function to reinitialize connection
async function initializeConnection(sessionId, _retryCount = 0) {
    try {
        const sessionDir = path.join(__dirname, "sessions", sessionId);
        
        if (!fs.existsSync(sessionDir)) {
            console.log(`⚠️ Session directory not found for ${sessionId}`);
            return;
        }

        const credsPath = path.join(sessionDir, 'creds.json');
        if (!fs.existsSync(credsPath)) {
            console.log(`⚠️ creds.json missing for ${sessionId}, cannot initialize`);
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

        // Replace old entry — naya conn register karo
        activeConnections.set(sessionId, { conn, saveCreds });
        connRegistry.set(sessionId, { conn, saveCreds });
        setupConnectionHandlers(conn, sessionId, io, saveCreds);

        // Global main conn update karo
        global.mainConn = conn;
        
        console.log(`🔌 initializeConnection: socket created for ${sessionId}`);
        
    } catch (error) {
        console.error(`❌ initializeConnection failed for ${sessionId} (attempt ${_retryCount + 1}):`, error.message);
        // Retry 3 baar, 10s ke baad
        if (_retryCount < 3) {
            setTimeout(() => initializeConnection(sessionId, _retryCount + 1), 10000);
        } else {
            console.error(`❌ Giving up on ${sessionId} after 3 init retries`);
        }
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
    const commandList = Array.from(commands.keys());
    res.json({ commands: commandList });
});

// ── Branding (pairing site name / logo / theme color) ────────────────────────
app.get("/api/branding", (req, res) => {
    res.json({
        botName:     getConfig('botName')     || 'DR-HONEY-MINI',
        botTagline:  getConfig('botTagline')  || 'Connect your WhatsApp account',
        botLogoIcon: getConfig('botLogoIcon') || 'fa-robot',
        botLogoUrl:  getConfig('botLogoUrl')  || '',
        themeColor:  getConfig('themeColor')  || '#6c3adb',
        colorPreset: getConfig('colorPreset') || 'purple'
    });
});

app.post("/api/admin/branding", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { botName, botTagline, botLogoIcon, botLogoUrl, themeColor, colorPreset } = req.body || {};

    if (botName !== undefined) {
        const name = String(botName).trim().slice(0, 40);
        if (!name) return res.status(400).json({ ok: false, error: "Bot name can't be empty" });
        setConfig('botName', name);
    }
    if (botTagline !== undefined) setConfig('botTagline', String(botTagline).trim().slice(0, 80));
    if (botLogoIcon !== undefined) setConfig('botLogoIcon', String(botLogoIcon).trim().slice(0, 40));
    if (botLogoUrl !== undefined) {
        const url = String(botLogoUrl).trim();
        if (url && !/^https?:\/\//i.test(url)) {
            return res.status(400).json({ ok: false, error: "Logo URL must start with http:// or https://" });
        }
        setConfig('botLogoUrl', url.slice(0, 500));
    }
    if (themeColor !== undefined) {
        const hex = String(themeColor).trim();
        if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) {
            return res.status(400).json({ ok: false, error: "Theme color must be a hex code like #6c3adb" });
        }
        if (hex) setConfig('themeColor', hex);
    }
    if (colorPreset !== undefined) {
        const allowed = ['purple','red','blue','green','orange','pink','custom'];
        if (!allowed.includes(colorPreset)) {
            return res.status(400).json({ ok: false, error: "Invalid color preset" });
        }
        setConfig('colorPreset', colorPreset);
    }

    res.json({ ok: true, branding: {
        botName:     getConfig('botName'),
        botTagline:  getConfig('botTagline'),
        botLogoIcon: getConfig('botLogoIcon'),
        botLogoUrl:  getConfig('botLogoUrl'),
        themeColor:  getConfig('themeColor'),
        colorPreset: getConfig('colorPreset')
    }});
});

// ── Admin Panel ──────────────────────────────────────────────────────────────
const ADMIN_CONFIG_FILE = path.join(__dirname, 'admin-config.json');

// ── Load password + history ────────────────────────────────────────────────
function loadAdminConfig() {
    try {
        if (fs.existsSync(ADMIN_CONFIG_FILE)) {
            const data = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8'));
            if (data && typeof data.password === 'string' && data.password.length > 0) {
                // Migrate old format (no history field)
                if (!Array.isArray(data.history)) {
                    data.history = [{
                        password: data.password,
                        changedAt: data.lastChanged || null,
                        note: 'Migrated from old format'
                    }];
                    fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(data, null, 2));
                }
                return data;
            }
        }
    } catch (e) {
        console.error('Failed to read admin-config.json:', e.message);
    }
    // Default first-time setup
    const defaultCfg = {
        password: process.env.ADMIN_PASSWORD || "admin1234",
        history: [{
            password: process.env.ADMIN_PASSWORD || "admin1234",
            changedAt: null,
            note: "Default password"
        }]
    };
    try { fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(defaultCfg, null, 2)); } catch(_) {}
    return defaultCfg;
}

function saveAdminPassword(newPassword) {
    try {
        let cfg = { password: newPassword, history: [] };
        // Load existing history first
        if (fs.existsSync(ADMIN_CONFIG_FILE)) {
            try { cfg = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8')); } catch(_) {}
        }
        if (!Array.isArray(cfg.history)) cfg.history = [];
        // Append new entry to history
        cfg.history.push({
            password: newPassword,
            changedAt: new Date().toISOString(),
            note: "Changed via admin panel"
        });
        cfg.password = newPassword;
        cfg.lastChanged = new Date().toISOString();
        fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(cfg, null, 2));
        ADMIN_PASSWORD = newPassword;
        console.log(`🔐 Admin password changed. History entries: ${cfg.history.length}`);
    } catch (e) {
        console.error('Failed to save admin password:', e.message);
        throw e;
    }
}

const _adminCfg = loadAdminConfig();
let ADMIN_PASSWORD = _adminCfg.password;

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

app.post("/api/admin/changepass", (req, res) => {
    const { current, newpass } = req.body;
    if (current !== ADMIN_PASSWORD) {
        return res.status(401).json({ ok: false, error: "Current password wrong" });
    }
    if (!newpass || typeof newpass !== 'string' || newpass.length < 6) {
        return res.status(400).json({ ok: false, error: "New password must be at least 6 characters" });
    }
    try {
        saveAdminPassword(newpass);
        res.json({ ok: true });
    } catch (e) {
        console.error('Failed to save new admin password:', e.message);
        res.status(500).json({ ok: false, error: "Could not save new password" });
    }
});

// ── Password History API ──────────────────────────────────────────────────
app.get("/api/admin/passhistory", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
        if (!fs.existsSync(ADMIN_CONFIG_FILE)) {
            return res.json({ history: [], current: ADMIN_PASSWORD });
        }
        const cfg = JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, "utf8"));
        const history = Array.isArray(cfg.history) ? cfg.history : [];
        res.json({
            current:  ADMIN_PASSWORD,
            total:    history.length,
            history:  history
        });
    } catch (e) {
        res.status(500).json({ error: "Could not read history" });
    }
});

app.get("/api/admin/stats", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { today: msgToday, week: msgWeek } = getCommandUsageStats();
    res.json({
        totalUsers:         totalUniqueNumbers,   // Total Users = total bot users count
        totalUniqueNumbers: totalUniqueNumbers,
        totalBotLinks:      totalBotLinks,         // lifetime links (backward compat)
        activeBots:         activeConnections.size, // Active Bots = currently active/linked bots
        activeSockets,
        msgToday,            // Msgs Today = total command uses today
        msgWeek,             // Msgs This Week = total command uses this week
        banned:             loadBannedNumbers().length,
        ipBans:             loadIpBans().length
    });
});

// ── Top Commands API ─────────────────────────────────────────────────────────
app.get("/api/admin/commands", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ commands: getTopCommands(50) });
});

// ── Command Error Log API ───────────────────────────────────────────────────
app.get("/api/admin/command-errors", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ errors: loadCommandErrors() });
});

app.delete("/api/admin/command-errors", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    saveCommandErrors([]);
    res.json({ ok: true });
});

// ── Banned Numbers API (persistent, server-side) ────────────────────────────
app.get("/api/admin/banned", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ banned: loadBannedNumbers() });
});

app.post("/api/admin/banned", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { number, reason } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: "number is required" });
    const list = loadBannedNumbers();
    const norm = normalizeNumber(number);
    if (list.some(b => normalizeNumber(b.number) === norm)) {
        return res.json({ ok: true, alreadyBanned: true, banned: list });
    }
    list.push({ number, reason: reason || '', date: new Date().toISOString() });
    saveBannedNumbers(list);
    broadcastStats();
    res.json({ ok: true, banned: list });
});

app.post("/api/admin/banned/remove", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { number } = req.body;
    const norm = normalizeNumber(number);
    const list = loadBannedNumbers().filter(b => normalizeNumber(b.number) !== norm);
    saveBannedNumbers(list);
    broadcastStats();
    res.json({ ok: true, banned: list });
});

// ── IP Bans API (persistent, server-side) ───────────────────────────────────
app.get("/api/admin/ipbans", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ ipBans: loadIpBans() });
});

app.post("/api/admin/ipbans", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ ok: false, error: "ip is required" });
    const list = loadIpBans();
    if (list.some(b => b.ip === ip)) {
        return res.json({ ok: true, alreadyBanned: true, ipBans: list });
    }
    list.push({ ip, date: new Date().toISOString() });
    saveIpBans(list);
    broadcastStats();
    res.json({ ok: true, ipBans: list });
});

app.post("/api/admin/ipbans/remove", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { ip } = req.body;
    const list = loadIpBans().filter(b => b.ip !== ip);
    saveIpBans(list);
    broadcastStats();
    res.json({ ok: true, ipBans: list });
});

// ── Real User List API (persistent, server-side) ────────────────────────────
app.get("/api/admin/users", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const banned = loadBannedNumbers().map(b => normalizeNumber(b.number));
    const users = loadUserRecords().map((u, i) => ({
        id:       i + 1,
        number:   u.number,
        name:     u.name || null,
        joinDate: u.joinDate ? u.joinDate.slice(0, 10) : null,
        lastSeen: u.lastSeen || null,
        banned:   banned.includes(normalizeNumber(u.number))
    })).sort((a, b) => (b.joinDate || '').localeCompare(a.joinDate || ''));
    res.json({ users });
});

app.delete("/api/admin/users/:number", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const norm = normalizeNumber(req.params.number);
    const list = loadUserRecords().filter(u => normalizeNumber(u.number) !== norm);
    saveUserRecords(list);
    res.json({ ok: true });
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
            connRegistry.delete(sessionId);
            activeSockets = Math.max(0, activeSockets - 1);
            broadcastStats();
            io.emit("unlinked", { sessionId });
        } catch(e) {}
        res.json({ ok: true });
    } else {
        res.status(404).json({ ok: false, error: "Session not found" });
    }
});

// ── FULL BACKUP / RESTORE (admin panel) ──────────────────────────────────────
// Combines every persistent JSON file + WhatsApp session creds into one blob
// so the admin can copy it out before redeploying and paste it back in after,
// without users needing to pair again.
const BOT_CONFIG_FILE = path.join(__dirname, 'bot-config.json');

const BACKUP_FILES = {
    persistentData:   DATA_FILE,
    userRecords:       USER_RECORDS_FILE,
    commandUsage:      COMMAND_USAGE_FILE,
    commandErrors:     COMMAND_ERRORS_FILE,
    bannedNumbers:     BANNED_NUMBERS_FILE,
    ipBans:            IP_BANS_FILE,
    adminConfig:       ADMIN_CONFIG_FILE,
    botConfig:         BOT_CONFIG_FILE
};

function readJsonSafe(filePath, fallback) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {}
    return fallback;
}

function buildFullBackup() {
    const backup = {
        version: 1,
        createdAt: new Date().toISOString(),
        files: {},
        sessions: {}
    };

    for (const [key, filePath] of Object.entries(BACKUP_FILES)) {
        backup.files[key] = readJsonSafe(filePath, null);
    }

    // Include WhatsApp session creds so users don't need to re-pair after restore
    try {
        const sessionsDir = path.join(__dirname, "sessions");
        if (fs.existsSync(sessionsDir)) {
            for (const sessionId of fs.readdirSync(sessionsDir)) {
                const credsPath = path.join(sessionsDir, sessionId, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const credsData = fs.readFileSync(credsPath, 'utf8');
                    backup.sessions[sessionId] = Buffer.from(credsData).toString('base64');
                }
            }
        }
    } catch (e) {
        console.error('Backup: failed reading sessions', e.message);
    }

    return backup;
}

function restoreFullBackup(backup) {
    const result = { filesRestored: [], sessionsRestored: [], errors: [] };
    if (!backup || typeof backup !== 'object') {
        result.errors.push('Invalid backup payload');
        return result;
    }

    if (backup.files) {
        for (const [key, filePath] of Object.entries(BACKUP_FILES)) {
            const data = backup.files[key];
            if (data === undefined || data === null) continue;
            try {
                atomicWriteSync(filePath, data);
                result.filesRestored.push(key);
            } catch (e) {
                result.errors.push(`Failed to restore ${key}: ${e.message}`);
            }
        }
    }

    if (backup.sessions) {
        try {
            const sessionsDir = path.join(__dirname, "sessions");
            if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
            for (const [sessionId, encoded] of Object.entries(backup.sessions)) {
                try {
                    const credsData = Buffer.from(encoded, 'base64').toString('utf8');
                    JSON.parse(credsData); // validate
                    const sessionDir = path.join(sessionsDir, sessionId);
                    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
                    fs.writeFileSync(path.join(sessionDir, 'creds.json'), credsData);
                    result.sessionsRestored.push(sessionId);
                } catch (e) {
                    result.errors.push(`Failed to restore session ${sessionId}: ${e.message}`);
                }
            }
        } catch (e) {
            result.errors.push(`Sessions restore error: ${e.message}`);
        }
    }

    // Reload in-memory counters from the freshly written files
    try {
        loadPersistentData();
    } catch (e) {}

    // Reload bot-config in memory after restore
    try {
        const { getAllConfig } = require('./lib/config');
        // Force re-read by deleting require cache
        delete require.cache[require.resolve('./lib/config')];
    } catch (e) {}

    return result;
}

// DEBUG endpoint — test karo ke server chal raha hai
app.get("/api/admin/backup/ping", (req, res) => {
    const pass = req.headers['x-admin-pass'] || '';
    const auth = checkAdminAuth(req);
    console.log('[PING] pass length:', pass.length, 'auth:', auth);
    res.json({
        ok: true,
        auth: auth,
        passReceived: pass.length > 0,
        serverTime: new Date().toISOString(),
        bodyLimit: '50mb'
    });
});

// GET — export everything as one JSON blob (shown in admin panel for copying)
app.get("/api/admin/backup/export", (req, res) => {
    const pass = req.headers['x-admin-pass'] || '';
    console.log('[BACKUP-EXPORT] request received, pass length:', pass.length, 'auth:', checkAdminAuth(req));
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized", hint: "x-admin-pass header check karein" });
    try {
        const backup = buildFullBackup();
        const size = JSON.stringify(backup).length;
        console.log('[BACKUP-EXPORT] success, size:', size, 'bytes');
        res.json({ ok: true, backup });
    } catch (e) {
        console.error('[BACKUP-EXPORT] error:', e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST — restore everything from a pasted JSON blob
app.post("/api/admin/backup/restore", (req, res) => {
    const pass = req.headers['x-admin-pass'] || '';
    const bodySize = JSON.stringify(req.body || {}).length;
    console.log('[BACKUP-RESTORE] request received, pass length:', pass.length, 'body size:', bodySize, 'auth:', checkAdminAuth(req));
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized", hint: "x-admin-pass header check karein" });
    try {
        const { backup } = req.body;
        if (!backup) {
            console.log('[BACKUP-RESTORE] ERROR: backup field missing in body');
            return res.status(400).json({ ok: false, error: 'backup field missing — valid JSON paste karein' });
        }
        console.log('[BACKUP-RESTORE] starting restore, files:', Object.keys(backup.files || {}).length, 'sessions:', Object.keys(backup.sessions || {}).length);
        const result = restoreFullBackup(backup);
        console.log('[BACKUP-RESTORE] done, restored:', result.filesRestored.length, 'files,', result.sessionsRestored.length, 'sessions, errors:', result.errors);
        broadcastStats();
        res.json({ ok: result.errors.length === 0, ...result });

        // ── Auto-reconnect restored sessions in background ────────────────
        // Session creds disk pe restore ho gayi hain — ab WhatsApp connections
        // bhi re-establish karo taake purane users ka bot immediately kaam kare
        if (result.sessionsRestored.length > 0) {
            console.log(`[BACKUP-RESTORE] 🔄 Reconnecting ${result.sessionsRestored.length} restored session(s) in background...`);
            setTimeout(async () => {
                for (const sessionId of result.sessionsRestored) {
                    if (activeConnections.has(sessionId)) {
                        console.log(`[BACKUP-RESTORE] Session already active, skipping: ${sessionId}`);
                        continue;
                    }
                    try {
                        await initializeConnection(sessionId);
                        console.log(`[BACKUP-RESTORE] ✅ Session reconnected: ${sessionId}`);
                    } catch (err) {
                        console.error(`[BACKUP-RESTORE] ❌ Failed to reconnect session ${sessionId}:`, err.message);
                    }
                }
                // Stats update karo active connections badhne ke baad
                broadcastStats();
                console.log('[BACKUP-RESTORE] ✅ All restored sessions reconnected, stats updated.');
            }, 2000); // 2 second delay — server settle ho jaye pehle
        }
        // ─────────────────────────────────────────────────────────────────
    } catch (e) {
        console.error('[BACKUP-RESTORE] exception:', e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── AUTO BACKUP TO HEROKU CONFIG VARS ────────────────────────────────────────
// Permanent fix: pushes the stats files (NOT session creds — those already
// have their own backup in lib/sessionStore.js) into a Heroku Config Var
// called STATS_BACKUP. Config Vars survive dyno restarts/redeploys, so on the
// next boot the data is auto-restored — no manual copy/paste needed.
//
// Setup (Heroku Dashboard > Settings > Config Vars, or CLI):
//   heroku config:set HEROKU_API_KEY=xxxxx --app your-app-name
//   heroku config:set HEROKU_APP_NAME=your-app-name --app your-app-name
//   heroku config:set AUTO_BACKUP_ENABLED=true --app your-app-name
const AUTO_BACKUP_ENABLED = process.env.AUTO_BACKUP_ENABLED === 'true';
const _herokuApiKey  = process.env.HEROKU_API_KEY || null;
const _herokuAppName = process.env.HEROKU_APP_NAME || null;
let _lastAutoBackupHash = null;

async function pushStatsBackupToConfigVar() {
    if (!AUTO_BACKUP_ENABLED) return;
    if (!_herokuApiKey || !_herokuAppName) {
        console.log('⚠️ AUTO_BACKUP_ENABLED=true but HEROKU_API_KEY/HEROKU_APP_NAME missing — skipping auto backup');
        return;
    }
    try {
        const filesOnly = {};
        for (const [key, filePath] of Object.entries(BACKUP_FILES)) {
            filesOnly[key] = readJsonSafe(filePath, null);
        }
        const payload = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), files: filesOnly });

        // Skip pushing if nothing changed since last time (saves API calls)
        const hash = payload.length + ':' + payload.slice(0, 100);
        if (hash === _lastAutoBackupHash) return;

        const encoded = Buffer.from(payload).toString('base64');
        const fetch = require('node-fetch');
        await fetch(`https://api.heroku.com/apps/${_herokuAppName}/config-vars`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.heroku+json; version=3',
                'Authorization': `Bearer ${_herokuApiKey}`
            },
            body: JSON.stringify({ STATS_BACKUP: encoded })
        });
        _lastAutoBackupHash = hash;
        console.log('☁️ Auto-backup pushed to Heroku Config Var (STATS_BACKUP)');
    } catch (e) {
        console.log('⚠️ Auto-backup to Config Var failed:', e.message);
    }
}

async function restoreStatsFromConfigVar() {
    if (!AUTO_BACKUP_ENABLED) {
        console.log('ℹ️ Auto-backup disabled (AUTO_BACKUP_ENABLED != true)');
        return;
    }
    const encoded = process.env.STATS_BACKUP;
    if (!encoded || encoded.trim() === '') {
        console.log('📭 No STATS_BACKUP config var found yet');
        return;
    }
    try {
        const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        const result = restoreFullBackup({ files: payload.files });
        console.log(`🔄 Restored stats from Config Var: ${result.filesRestored.join(', ')}`);
    } catch (e) {
        console.log('⚠️ Failed to restore stats from Config Var:', e.message);
    }
}

// Auto-push every 5 minutes (only sends if data actually changed)
if (AUTO_BACKUP_ENABLED) {
    setInterval(pushStatsBackupToConfigVar, 5 * 60 * 1000);
}

// Manual trigger endpoint (admin panel "Force Auto-Backup Now" button)
app.post("/api/admin/backup/autobackup-now", async (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    if (!AUTO_BACKUP_ENABLED) {
        // Heroku disabled hai — phir bhi backup data return karo taake admin download kar sake
        try {
            const backup = buildFullBackup();
            return res.json({ ok: true, herokuSkipped: true, backup });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    }
    await pushStatsBackupToConfigVar();
    // Return backup data along with success so admin can also download it
    try {
        const backup = buildFullBackup();
        res.json({ ok: true, backup });
    } catch (e) {
        res.json({ ok: true });
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
    try { atomicWriteWithBackup(USAGE_FILE, data); } catch(e) {}
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

// ── BOT UPTIME API ──────────────────────────────────────────────────────────
// Live uptime seconds return karo — frontend timer ke liye
app.get("/api/uptime", (req, res) => {
    const upSec = Math.floor(process.uptime());
    res.json({ uptimeSeconds: upSec });
});

// ── RATINGS API ─────────────────────────────────────────────────────────────
const RATINGS_FILE = path.join(__dirname, 'database', 'ratings.json');

function loadRatings() {
    try {
        if (fs.existsSync(RATINGS_FILE)) return JSON.parse(fs.readFileSync(RATINGS_FILE, 'utf8'));
    } catch(e) {}
    return { ratings: [], summary: { total: 0, sum: 0, avg: 0, breakdown: {1:0,2:0,3:0,4:0,5:0} } };
}

function saveRatingsData(data) {
    try {
        const dir = path.dirname(RATINGS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(RATINGS_FILE, JSON.stringify(data, null, 2));
    } catch(e) { console.error('Ratings save error:', e.message); }
}

// Public POST — visitor rating save karo
app.post("/api/rate", (req, res) => {
    try {
        const { rating } = req.body;
        const r = parseInt(rating);
        if (!r || r < 1 || r > 5) return res.status(400).json({ ok: false, error: "Rating 1-5 required" });
        const data = loadRatings();
        data.ratings.push({ rating: r, ts: Date.now(), ip: req.ip });
        data.summary.total++;
        data.summary.sum += r;
        data.summary.avg = Math.round((data.summary.sum / data.summary.total) * 10) / 10;
        data.summary.breakdown[r] = (data.summary.breakdown[r] || 0) + 1;
        saveRatingsData(data);
        console.log(`⭐ New rating: ${r}/5 | Avg: ${data.summary.avg} | Total: ${data.summary.total}`);
        res.json({ ok: true, avg: data.summary.avg, total: data.summary.total });
    } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Admin GET — all ratings
app.get("/api/admin/ratings", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json(loadRatings());
});

// ── BOT LOGO UPLOAD API ─────────────────────────────────────────────────────
// Admin panel ya main site se custom logo upload karne ke liye
const LOGO_FILE = path.join(__dirname, 'public', 'bot-logo.png');

app.post("/api/admin/upload-logo", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
        const { imageData } = req.body; // base64 data URL
        if (!imageData) return res.status(400).json({ ok: false, error: "imageData required" });
        // base64 extract
        const matches = imageData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) return res.status(400).json({ ok: false, error: "Invalid image data" });
        const buffer = Buffer.from(matches[2], 'base64');
        if (buffer.length > 2 * 1024 * 1024) return res.status(400).json({ ok: false, error: "Image too large (max 2MB)" });
        fs.writeFileSync(LOGO_FILE, buffer);
        setConfig('botLogoUrl', '/bot-logo.png');
        console.log('🖼️ Bot logo uploaded successfully');
        res.json({ ok: true, logoUrl: '/bot-logo.png' });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.delete("/api/admin/upload-logo", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
        if (fs.existsSync(LOGO_FILE)) fs.unlinkSync(LOGO_FILE);
        setConfig('botLogoUrl', '');
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Admin page route ─────────────────────────────────────────────────────────
// ── Command Toggle API ────────────────────────────────────────────────────────
const DISABLED_CMDS_FILE = path.join(__dirname, 'disabled-commands.json');
function loadDisabledCmds() {
    try { if (fs.existsSync(DISABLED_CMDS_FILE)) return JSON.parse(fs.readFileSync(DISABLED_CMDS_FILE,'utf8')); } catch(e){}
    return [];
}
function saveDisabledCmds(list) {
    try { atomicWriteWithBackup(DISABLED_CMDS_FILE, list); } catch(e){}
}
app.get("/api/admin/disabled-commands", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ disabled: loadDisabledCmds() });
});
app.post("/api/admin/disabled-commands/toggle", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { command } = req.body;
    if (!command) return res.status(400).json({ ok: false, error: "command required" });
    let list = loadDisabledCmds();
    if (list.includes(command)) {
        list = list.filter(c => c !== command);
        saveDisabledCmds(list);
        res.json({ ok: true, status: 'enabled' });
    } else {
        list.push(command);
        saveDisabledCmds(list);
        res.json({ ok: true, status: 'disabled' });
    }
});

// ── Maintenance Mode API ──────────────────────────────────────────────────────
const MAINTENANCE_FILE = path.join(__dirname, 'maintenance.json');
function loadMaintenance() {
    try { if (fs.existsSync(MAINTENANCE_FILE)) return JSON.parse(fs.readFileSync(MAINTENANCE_FILE,'utf8')); } catch(e){}
    return { enabled: false, message: "Bot maintenance mein hai. Thodi der baad try karein." };
}
function saveMaintenance(data) {
    try { atomicWriteWithBackup(MAINTENANCE_FILE, data); } catch(e){}
}
app.get("/api/admin/maintenance", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json(loadMaintenance());
});
app.post("/api/admin/maintenance", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { enabled, message } = req.body;
    const data = { enabled: !!enabled, message: message || "Bot maintenance mein hai." };
    saveMaintenance(data);
    res.json({ ok: true, ...data });
});

// ── Auto Reply API ────────────────────────────────────────────────────────────
const AUTOREPLY_FILE = path.join(__dirname, 'auto-replies.json');
function loadAutoReplies() {
    try { if (fs.existsSync(AUTOREPLY_FILE)) return JSON.parse(fs.readFileSync(AUTOREPLY_FILE,'utf8')); } catch(e){}
    return [];
}
function saveAutoReplies(list) {
    try { atomicWriteWithBackup(AUTOREPLY_FILE, list); } catch(e){}
}
app.get("/api/admin/autoreplies", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ replies: loadAutoReplies() });
});
app.post("/api/admin/autoreplies", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { keyword, reply, matchType } = req.body;
    if (!keyword || !reply) return res.status(400).json({ ok: false, error: "keyword and reply required" });
    const list = loadAutoReplies();
    const id = Date.now().toString();
    list.push({ id, keyword, reply, matchType: matchType || 'exact', createdAt: new Date().toISOString() });
    saveAutoReplies(list);
    res.json({ ok: true, id });
});
app.delete("/api/admin/autoreplies/:id", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const list = loadAutoReplies().filter(r => r.id !== id);
    saveAutoReplies(list);
    res.json({ ok: true });
});

// ── Scheduled Broadcast API ───────────────────────────────────────────────────
const SCHEDULED_BC_FILE = path.join(__dirname, 'scheduled-broadcasts.json');
function loadScheduledBroadcasts() {
    try { if (fs.existsSync(SCHEDULED_BC_FILE)) return JSON.parse(fs.readFileSync(SCHEDULED_BC_FILE,'utf8')); } catch(e){}
    return [];
}
function saveScheduledBroadcasts(list) {
    try { atomicWriteWithBackup(SCHEDULED_BC_FILE, list); } catch(e){}
}
app.get("/api/admin/scheduled-broadcasts", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json({ broadcasts: loadScheduledBroadcasts() });
});
app.post("/api/admin/scheduled-broadcasts", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { message, scheduledTime, target } = req.body;
    if (!message || !scheduledTime) return res.status(400).json({ ok: false, error: "message and scheduledTime required" });
    const list = loadScheduledBroadcasts();
    const id = Date.now().toString();
    list.push({ id, message, scheduledTime, target: target || 'all', status: 'pending', createdAt: new Date().toISOString() });
    saveScheduledBroadcasts(list);
    res.json({ ok: true, id });
});
app.delete("/api/admin/scheduled-broadcasts/:id", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;
    const list = loadScheduledBroadcasts().filter(b => b.id !== id);
    saveScheduledBroadcasts(list);
    res.json({ ok: true });
});

// ── Live Message Log API ──────────────────────────────────────────────────────
const MAX_LIVE_LOG = 100;
const liveMessageLog = [];
function addToLiveLog(sessionId, from, body) {
    liveMessageLog.unshift({ sessionId, from, body: (body||'').slice(0,200), time: new Date().toISOString() });
    if (liveMessageLog.length > MAX_LIVE_LOG) liveMessageLog.pop();
}
app.get("/api/admin/live-log", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const limit = parseInt(req.query.limit) || 50;
    res.json({ logs: liveMessageLog.slice(0, limit) });
});
app.delete("/api/admin/live-log", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    liveMessageLog.length = 0;
    res.json({ ok: true });
});

// ── Bot Settings API ──────────────────────────────────────────────────────────
const BOT_SETTINGS_FILE = path.join(__dirname, 'bot-settings.json');
function loadBotSettings() {
    try { if (fs.existsSync(BOT_SETTINGS_FILE)) return JSON.parse(fs.readFileSync(BOT_SETTINGS_FILE,'utf8')); } catch(e){}
    return { prefix: '.', welcomeMsg: 'Welcome to the bot!', botStatus: 'online' };
}
function saveBotSettings(data) {
    try { atomicWriteWithBackup(BOT_SETTINGS_FILE, data); } catch(e){}
}
app.get("/api/admin/bot-settings", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    res.json(loadBotSettings());
});
app.post("/api/admin/bot-settings", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const current = loadBotSettings();
    const updated = { ...current, ...req.body };
    saveBotSettings(updated);
    res.json({ ok: true, ...updated });
});

// ── User Search API ───────────────────────────────────────────────────────────
app.get("/api/admin/users/search", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    const q = (req.query.q || '').toLowerCase();
    const all = loadUserRecords();
    const banned = loadBannedNumbers();
    const results = all.filter(u =>
        u.number?.toLowerCase().includes(q) ||
        (u.name || '').toLowerCase().includes(q)
    ).map(u => ({ ...u, banned: banned.includes(u.number) }));
    res.json({ users: results.slice(0, 50) });
});

// ── Daily Stats API ───────────────────────────────────────────────────────────
app.get("/api/admin/daily-stats", (req, res) => {
    if (!checkAdminAuth(req)) return res.status(401).json({ error: "Unauthorized" });
    try {
        const usageData = loadUsageData();
        const daily = usageData.daily || {};
        const days = Object.keys(daily).sort().slice(-14);
        const data = days.map(d => ({ date: d, count: Object.values(daily[d] || {}).reduce((a,b) => a+b, 0) }));
        res.json({ data });
    } catch(e) {
        res.json({ data: [] });
    }
});

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
                    // activeSockets connection.update "open" mein automatically count hoga
                } else {
                    console.log(`❌ No valid auth state found for session: ${sessionId}`);
                    console.log(`📁 Keeping session folder for potential reuse: ${sessionId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to reload session ${sessionId}:`, error.message);
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

    // ── HEROKU STATS AUTO-RESTORE ───────────────────────────────────────────
    // Config Var (STATS_BACKUP) se totals/banned/ipBans/etc restore karo,
    // taake dyno restart/redeploy ke baad bhi counts 0 pe na jayein.
    await restoreStatsFromConfigVar();
    // ──────────────────────────────────────────────────────────────────────

    // ── HEROKU SESSION RESTORE ─────────────────────────────────────────────
    // Pehle env vars se sessions restore karo (Heroku ke liye zaroori)
    // Yeh ensure karta hai ke Heroku restart/redeploy ke baad bhi sessions zinda rahein
    const sessionsDir = path.join(__dirname, "sessions");
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
    await restoreSessionsFromEnv(sessionsDir);
    // ──────────────────────────────────────────────────────────────────────
    
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

  // One last push to Heroku Config Var so nothing is lost between deploys
  if (AUTO_BACKUP_ENABLED) {
    pushStatsBackupToConfigVar().catch(() => {});
  }
  
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
  // Emergency save on crash
  try { atomicWriteSync(DATA_FILE, { totalUniqueNumbers, totalBotLinks, totalUsers: totalUniqueNumbers, lastUpdated: new Date().toISOString() }); } catch(_) {}
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  // Emergency save on crash
  try { atomicWriteSync(DATA_FILE, { totalUniqueNumbers, totalBotLinks, totalUsers: totalUniqueNumbers, lastUpdated: new Date().toISOString() }); } catch(_) {}
});