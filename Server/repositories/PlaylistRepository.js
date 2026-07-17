const db = require('../database/db');
const { RATING_MIN, RATING_MAX } = require('../constants');

class PlaylistRepository {

    // Next position for a new row in `table`, scoped by `column` = `value`
    // (e.g. the next slot at the end of a user's playlists, or a playlist's songs).
    getNextPosition(table, column, value) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT MAX(position) as maxPos FROM ${table} WHERE ${column} = ?`, [value], (err, row) => {
                if (err) return reject(err);
                resolve(row && row.maxPos !== null ? row.maxPos + 1 : 0);
            });
        });
    }

    // Create with position
    async createPlaylist(userId, name) {
        const newPos = await this.getNextPosition('playlists', 'userId', userId);
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO playlists (userId, name, createdAt, position) VALUES (?, ?, ?, ?)`;
            db.run(sql, [userId, name, new Date().toISOString(), newPos], function(err) {
                if (err) return reject(err); resolve(this.lastID);
            });
        });
    }

    // Order by Position
    getUserPlaylists(userId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM playlists WHERE userId = ? ORDER BY position ASC, id ASC`;
            db.all(sql, [userId], (err, rows) => {
                if (err) return reject(err);
                // Attach id, userId, name, createdAt. position is internal
                resolve(rows.map(r => ({...r}))); 
            });
        });
    }

    getPlaylistById(id) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM playlists WHERE id = ?`, [id], (err, row) => {
                if (err) return reject(err); resolve(row);
            });
        });
    }

    deletePlaylist(id) {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM playlists WHERE id = ?`, [id], (err) => {
                if (err) return reject(err); resolve(true);
            });
        });
    }

    // --- Reorder Logic ---
    reorderPlaylists(userId, orderedIds) {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                const stmt = db.prepare("UPDATE playlists SET position = ? WHERE id = ? AND userId = ?");
                
                orderedIds.forEach((id, index) => {
                    stmt.run(index, id, userId);
                });
                
                stmt.finalize();
                db.run("COMMIT", (err) => {
                    if (err) reject(err);
                    else resolve(true);
                });
            });
        });
    }

    // --- SONGS ---
    async addSong(playlistId, videoId, title, thumbnailUrl, source='youtube') {
        const newPos = await this.getNextPosition('playlist_songs', 'playlistId', playlistId);
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO playlist_songs (playlistId, videoId, title, thumbnailUrl, position, source, rating) VALUES (?, ?, ?, ?, ?, ?, 0)`,
                [playlistId, videoId, title, thumbnailUrl, newPos, source], function(err) { if(err) reject(err); else resolve(this.lastID); });
        });
    }
    // playlistId scopes the delete so a song can only be removed from its own playlist
    removeSong(songId, playlistId) {
        return new Promise((resolve, reject) => {
            const sql = playlistId
                ? `DELETE FROM playlist_songs WHERE id = ? AND playlistId = ?`
                : `DELETE FROM playlist_songs WHERE id = ?`;
            const params = playlistId ? [songId, playlistId] : [songId];
            db.run(sql, params, (err) => { if(err) reject(err); else resolve(true); });
        });
    }
    getSongsByPlaylistId(playlistId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM playlist_songs WHERE playlistId = ? ORDER BY position ASC`;
            db.all(sql, [playlistId], (err, rows) => { if (err) return reject(err); resolve(rows); });
        });
    }
    updateSongRating(songId, rating, playlistId) {
        return new Promise((resolve, reject) => {
            const safeRating = Math.max(RATING_MIN, Math.min(RATING_MAX, parseInt(rating, 10) || 0));
            const sql = playlistId
                ? `UPDATE playlist_songs SET rating = ? WHERE id = ? AND playlistId = ?`
                : `UPDATE playlist_songs SET rating = ? WHERE id = ?`;
            const params = playlistId ? [safeRating, songId, playlistId] : [safeRating, songId];
            db.run(sql, params, (err) => { if(err) reject(err); else resolve(true); });
        });
    }
    renamePlaylist(id, newName) {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE playlists SET name = ? WHERE id = ?`, [newName, id], (err) => { if(err) reject(err); else resolve(true); });
        });
    }
}
module.exports = new PlaylistRepository();