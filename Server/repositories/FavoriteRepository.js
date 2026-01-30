const db = require('../database/db');

class FavoriteRepository {
    
    add(userId, videoId, title, thumbnailUrl) {
        return new Promise((resolve, reject) => {
            // Avoid duplicates
            this.checkIsFavorite(userId, videoId).then(exists => {
                if (exists) return resolve(null); // Already exists
                
                const sql = `INSERT INTO favorites (userId, videoId, title, thumbnailUrl, createdAt) VALUES (?, ?, ?, ?, ?)`;
                db.run(sql, [userId, videoId, title, thumbnailUrl, new Date().toISOString()], function(err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                });
            });
        });
    }

    remove(userId, videoId) {
        return new Promise((resolve, reject) => {
            const sql = `DELETE FROM favorites WHERE userId = ? AND videoId = ?`;
            db.run(sql, [userId, videoId], (err) => {
                if (err) return reject(err);
                resolve(true);
            });
        });
    }

    getAll(userId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM favorites WHERE userId = ? ORDER BY id DESC`;
            db.all(sql, [userId], (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    checkIsFavorite(userId, videoId) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT id FROM favorites WHERE userId = ? AND videoId = ?`, [userId, videoId], (err, row) => {
                if (err) return reject(err);
                resolve(!!row);
            });
        });
    }
}

module.exports = new FavoriteRepository();