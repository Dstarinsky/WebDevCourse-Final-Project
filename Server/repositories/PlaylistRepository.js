const db = require('../database/db');
const Playlist = require('../models/Playlist');
const PlaylistSong = require('../models/PlaylistSong');

// Identifier allowlist for getNextPosition. Table and column names cannot be bound
// as parameters, so they are looked up here rather than interpolated from arguments.
const POSITION_SCOPES = {
    playlists: 'userId',
    playlist_songs: 'playlistId'
};

class PlaylistRepository {
    /** Next free position at the end of a scope. */
    async getNextPosition(table, scopeValue) {
        const column = POSITION_SCOPES[table];
        if (!column) throw new Error(`Unknown position scope: ${table}`);
        const row = await db.get(
            `SELECT MAX(position) AS maxPos FROM ${table} WHERE ${column} = ?`,
            [scopeValue]
        );
        return row && row.maxPos !== null ? row.maxPos + 1 : 0;
    }

    // --- playlists ---------------------------------------------------------

    async createPlaylist(userId, name) {
        const position = await this.getNextPosition('playlists', userId);
        const { lastID } = await db.run(
            'INSERT INTO playlists (userId, name, createdAt, position) VALUES (?, ?, ?, ?)',
            [userId, name, new Date().toISOString(), position]
        );
        return lastID;
    }

    async getUserPlaylists(userId) {
        const rows = await db.all(
            'SELECT * FROM playlists WHERE userId = ? ORDER BY position ASC, id ASC',
            [userId]
        );
        return rows.map(Playlist.fromRow);
    }

    /**
     * Ownership is enforced in SQL rather than fetched-then-compared, so there is no
     * window in which a caller can forget the check.
     */
    async findOwnedPlaylist(playlistId, userId) {
        return Playlist.fromRow(
            await db.get('SELECT * FROM playlists WHERE id = ? AND userId = ?', [
                playlistId,
                userId
            ])
        );
    }

    /** @returns {boolean} whether a row owned by this user was deleted. */
    async deletePlaylist(playlistId, userId) {
        const { changes } = await db.run('DELETE FROM playlists WHERE id = ? AND userId = ?', [
            playlistId,
            userId
        ]);
        return changes > 0;
    }

    async renamePlaylist(playlistId, userId, newName) {
        const { changes } = await db.run(
            'UPDATE playlists SET name = ? WHERE id = ? AND userId = ?',
            [newName, playlistId, userId]
        );
        return changes > 0;
    }

    /**
     * Persist a drag-and-drop ordering.
     * Runs in a transaction that rolls back if any row fails to update, and reports
     * how many rows moved so the caller can reject an order containing IDs the user
     * does not own.
     */
    async reorderPlaylists(userId, orderedIds) {
        return db.transaction(async () => {
            const current = await db.all('SELECT id FROM playlists WHERE userId = ? ORDER BY id', [
                userId
            ]);
            const currentIds = current.map((row) => row.id);
            const requested = new Set(orderedIds);
            if (
                orderedIds.length !== currentIds.length ||
                currentIds.some((id) => !requested.has(id))
            ) {
                throw new Error('Reorder must include every playlist exactly once');
            }

            let updated = 0;
            for (const [index, id] of orderedIds.entries()) {
                const { changes } = await db.run(
                    'UPDATE playlists SET position = ? WHERE id = ? AND userId = ?',
                    [index, id, userId]
                );
                updated += changes;
            }
            if (updated !== orderedIds.length) {
                throw new Error('Reorder referenced playlists that do not belong to this user');
            }
            return updated;
        });
    }

    // --- songs -------------------------------------------------------------

    async addSong(
        playlistId,
        {
            videoId,
            title,
            thumbnailUrl = null,
            source = 'youtube',
            mimeType = null,
            sizeBytes = null
        }
    ) {
        const position = await this.getNextPosition('playlist_songs', playlistId);
        const { lastID } = await db.run(
            `INSERT INTO playlist_songs
                (playlistId, videoId, title, thumbnailUrl, position, source, rating, mimeType, sizeBytes)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [playlistId, videoId, title, thumbnailUrl, position, source, mimeType, sizeBytes]
        );
        return PlaylistSong.fromRow({
            id: lastID,
            playlistId,
            videoId,
            title,
            thumbnailUrl,
            position,
            source,
            rating: 0,
            mimeType,
            sizeBytes
        });
    }

    async getSongsByPlaylistId(playlistId) {
        const rows = await db.all(
            'SELECT * FROM playlist_songs WHERE playlistId = ? ORDER BY position ASC, id ASC',
            [playlistId]
        );
        return rows.map(PlaylistSong.fromRow);
    }

    /** A single song, but only if the requesting user owns its playlist. */
    async findSongForUser(songId, userId) {
        return PlaylistSong.fromRow(
            await db.get(
                `SELECT s.* FROM playlist_songs s
                 JOIN playlists p ON p.id = s.playlistId
                 WHERE s.id = ? AND p.userId = ?`,
                [songId, userId]
            )
        );
    }

    /** Local uploads in a playlist — used to delete files alongside their rows. */
    async getLocalSongsByPlaylistId(playlistId) {
        const rows = await db.all(
            `SELECT * FROM playlist_songs WHERE playlistId = ? AND source = 'local'`,
            [playlistId]
        );
        return rows.map(PlaylistSong.fromRow);
    }

    /** Administrative inventory used by the orphan reconciliation command. */
    async getAllLocalSongs() {
        const rows = await db.all(
            `SELECT * FROM playlist_songs WHERE source = 'local' ORDER BY id`
        );
        return rows.map(PlaylistSong.fromRow);
    }

    /** playlistId scopes the delete so a song can only be removed from its own playlist. */
    async removeSong(songId, playlistId) {
        const { changes } = await db.run(
            'DELETE FROM playlist_songs WHERE id = ? AND playlistId = ?',
            [songId, playlistId]
        );
        return changes > 0;
    }

    async updateSongRating(songId, playlistId, rating) {
        const { changes } = await db.run(
            'UPDATE playlist_songs SET rating = ? WHERE id = ? AND playlistId = ?',
            [rating, songId, playlistId]
        );
        return changes > 0;
    }

    /** Per-user upload totals, for quota enforcement. */
    async getUploadUsage(userId) {
        const row = await db.get(
            `SELECT COUNT(*) AS fileCount, COALESCE(SUM(s.sizeBytes), 0) AS totalBytes
             FROM playlist_songs s
             JOIN playlists p ON p.id = s.playlistId
             WHERE p.userId = ? AND s.source = 'local'`,
            [userId]
        );
        return { fileCount: row.fileCount, totalBytes: row.totalBytes };
    }
}

module.exports = new PlaylistRepository();
