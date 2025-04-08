const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (err) {
        return { users: [], notices: [], otps: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };