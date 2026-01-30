const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../client/uploads');
if (!fs.existsSync(uploadDir)){ fs.mkdirSync(uploadDir, { recursive: true }); }

const dbPath = path.resolve(__dirname, 'music_app.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error(err.message);
    else {
        console.log('Connected to SQLite database.');
        
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE, firstName TEXT, lastName TEXT, passwordHash TEXT, createdAt TEXT
        )`);

        // Playlists Table
        db.run(`CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, name TEXT, createdAt TEXT, position INTEGER DEFAULT 0, 
            FOREIGN KEY(userId) REFERENCES users(id)
        )`);
        // Migration: Ensure 'position' exists for old databases
        db.run(`ALTER TABLE playlists ADD COLUMN position INTEGER DEFAULT 0`, () => {});

        // Songs Table
        db.run(`CREATE TABLE IF NOT EXISTS playlist_songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, playlistId INTEGER, videoId TEXT, title TEXT, thumbnailUrl TEXT, position INTEGER, source TEXT DEFAULT 'youtube', rating INTEGER DEFAULT 0,
            FOREIGN KEY(playlistId) REFERENCES playlists(id) ON DELETE CASCADE
        )`);

        // Favorites Table
        db.run(`CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            userId INTEGER, 
            videoId TEXT, 
            title TEXT, 
            thumbnailUrl TEXT, 
            createdAt TEXT,
            FOREIGN KEY(userId) REFERENCES users(id)
        )`);

        // FORCE ADD 'createdAt' COLUMN IF MISSING 
        db.run(`ALTER TABLE favorites ADD COLUMN createdAt TEXT`, (err) => {
            // If the column already exists, this will throw an error which we safely ignore here
        });
    }
});
module.exports = db;