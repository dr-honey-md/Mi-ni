const fs = require('fs');
const path = require('path');

const MODE_FILE = path.join(__dirname, '..', 'bot-mode.json');

let currentMode = 'public'; // default mode

function loadMode() {
    try {
        if (fs.existsSync(MODE_FILE)) {
            const data = JSON.parse(fs.readFileSync(MODE_FILE, 'utf8'));
            if (data.mode === 'public' || data.mode === 'private') {
                currentMode = data.mode;
            }
        } else {
            saveMode('public');
        }
    } catch (error) {
        console.error('❌ Error loading bot mode:', error.message);
        currentMode = 'public';
    }
    return currentMode;
}

function saveMode(mode) {
    try {
        currentMode = mode;
        fs.writeFileSync(MODE_FILE, JSON.stringify({ mode, updatedAt: new Date().toISOString() }, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Error saving bot mode:', error.message);
        return false;
    }
}

function getMode() {
    return currentMode;
}

function setMode(mode) {
    if (mode !== 'public' && mode !== 'private') return false;
    return saveMode(mode);
}

// Load mode on startup
loadMode();

module.exports = { getMode, setMode, loadMode };
