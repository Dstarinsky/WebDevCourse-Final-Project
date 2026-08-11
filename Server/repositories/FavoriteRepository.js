const db = require('../database/db');
const Favorite = require('../models/Favorite');

class FavoriteRepository {
    constructor(adapter = db) {
        this.db = adapter;
    }

    /**
     * Insert unless the pair already exists.
     * The old check-then-insert could race two concurrent requests into duplicate
     * rows, and its inner `.then()` had no `.catch`, so a failing SELECT left the
     * outer promise permanently unsettled and hung the request. UNIQUE(userId,
     * videoId) plus ON CONFLICT makes this atomic and removes the pre-check.
     * @returns {number|null} new row id, or null when it already existed.
     */
    async add(userId, videoId, title, thumbnailUrl) {
        const { changes, lastID } = await this.db.run(
            `INSERT INTO favorites (userId, videoId, title, thumbnailUrl, createdAt)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (userId, videoId) DO NOTHING`,
            [userId, videoId, title, thumbnailUrl, new Date().toISOString()]
        );
        return changes > 0 ? lastID : null;
    }

    /** @returns {boolean} whether a row was actually deleted. */
    async remove(userId, videoId) {
        const { changes } = await this.db.run(
            'DELETE FROM favorites WHERE userId = ? AND videoId = ?',
            [userId, videoId]
        );
        return changes > 0;
    }

    async getAll(userId) {
        const rows = await this.db.all(
            'SELECT * FROM favorites WHERE userId = ? ORDER BY id DESC',
            [userId]
        );
        return rows.map(Favorite.fromRow);
    }

    /**
     * Which of `videoIds` this user has already saved.
     * Replaces the previous one-query-per-search-result N+1.
     * @returns {Set<string>}
     */
    async findSavedVideoIds(userId, videoIds) {
        if (videoIds.length === 0) return new Set();
        const placeholders = videoIds.map(() => '?').join(', ');
        const rows = await this.db.all(
            `SELECT videoId FROM favorites WHERE userId = ? AND videoId IN (${placeholders})`,
            [userId, ...videoIds]
        );
        return new Set(rows.map((r) => r.videoId));
    }
}

module.exports = new FavoriteRepository();
module.exports.FavoriteRepository = FavoriteRepository;
