const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { configureTestEnv } = require('./helpers');

configureTestEnv();
const appDb = require('../database/db');
const { createAdapter } = require('../database/sqlite');
const { migrate, MIGRATIONS } = require('../database/migrations');
const { FavoriteRepository } = require('../repositories/FavoriteRepository');

const openMemoryDatabase = () => createAdapter(new sqlite3.Database(':memory:'));

test.after(() => appDb.close());

test('FavoriteRepository.add rejects promptly when SQLite rejects', async () => {
    const expected = new Error('forced select/insert failure');
    const repository = new FavoriteRepository({
        run: async () => {
            throw expected;
        }
    });
    await assert.rejects(
        repository.add(1, 'dQw4w9WgXcQ', 'Track', null),
        (err) => err === expected
    );
});

test('transactions roll back every preceding write after a statement fails', async () => {
    const db = openMemoryDatabase();
    try {
        await db.run('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
        await assert.rejects(
            db.transaction(async () => {
                await db.run('INSERT INTO items (value) VALUES (?)', ['must roll back']);
                await db.run('INSERT INTO missing_table (value) VALUES (?)', ['boom']);
            })
        );
        assert.equal((await db.get('SELECT COUNT(*) AS count FROM items')).count, 0);
    } finally {
        await db.close();
    }
});

test('legacy schema migrates once with constraints, indexes, deduplication, and cascades', async () => {
    const db = openMemoryDatabase();
    try {
        await db.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT,
                firstName TEXT,
                passwordHash TEXT,
                createdAt TEXT
            );
            CREATE TABLE playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER,
                name TEXT,
                createdAt TEXT,
                position INTEGER
            );
            CREATE TABLE playlist_songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlistId INTEGER,
                videoId TEXT,
                title TEXT,
                position INTEGER,
                source TEXT,
                rating INTEGER
            );
            CREATE TABLE favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId INTEGER,
                videoId TEXT,
                title TEXT,
                createdAt TEXT
            );
        `);
        await db.run(
            `INSERT INTO users (email, firstName, passwordHash, createdAt)
             VALUES (?, ?, ?, ?)`,
            ['legacy@example.com', 'Legacy', 'hash', new Date().toISOString()]
        );
        await db.run(
            `INSERT INTO playlists (userId, name, createdAt, position)
             VALUES (1, 'Legacy list', datetime('now'), 0)`
        );
        await db.run(
            `INSERT INTO playlist_songs
                (playlistId, videoId, title, position, source, rating)
             VALUES (1, 'dQw4w9WgXcQ', 'Legacy song', 0, 'youtube', 99)`
        );
        await db.run(
            `INSERT INTO favorites (userId, videoId, title, createdAt)
             VALUES (1, 'dQw4w9WgXcQ', 'First', datetime('now'))`
        );
        await db.run(
            `INSERT INTO favorites (userId, videoId, title, createdAt)
             VALUES (1, 'dQw4w9WgXcQ', 'Duplicate', datetime('now'))`
        );
        await db.run(
            `INSERT INTO playlists (userId, name, createdAt, position)
             VALUES (999, 'Orphan playlist', datetime('now'), 1)`
        );
        await db.run(
            `INSERT INTO playlist_songs
                (playlistId, videoId, title, position, source, rating)
             VALUES (999, 'abcdefghijk', 'Orphan song', 1, 'youtube', 0)`
        );
        await db.run(
            `INSERT INTO favorites (userId, videoId, title, createdAt)
             VALUES (999, 'abcdefghijk', 'Orphan favorite', datetime('now'))`
        );

        const result = await migrate(db);
        const expectedVersions = MIGRATIONS.map((migration) => migration.version);
        assert.equal(result.version, expectedVersions.at(-1));
        assert.deepEqual(result.applied, expectedVersions);
        assert.equal((await db.get('SELECT COUNT(*) AS count FROM favorites')).count, 1);
        assert.equal((await db.get('SELECT COUNT(*) AS count FROM playlists')).count, 1);
        assert.equal((await db.get('SELECT COUNT(*) AS count FROM playlist_songs')).count, 1);
        assert.equal((await db.get('SELECT rating FROM playlist_songs')).rating, 10);
        assert.equal((await db.get('PRAGMA user_version')).user_version, expectedVersions.at(-1));

        const indexes = await db.all(
            `SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`
        );
        assert.deepEqual(
            new Set(indexes.map((row) => row.name)),
            new Set(['idx_playlists_user', 'idx_songs_playlist', 'idx_favorites_user'])
        );
        await assert.rejects(
            db.run(
                `INSERT INTO playlist_songs
                    (playlistId, videoId, title, position, source, rating)
                 VALUES (1, 'abcdefghijk', 'Bad rating', 1, 'youtube', 11)`
            ),
            /CHECK constraint failed/
        );

        await db.run('DELETE FROM users WHERE id = 1');
        assert.equal((await db.get('SELECT COUNT(*) AS count FROM playlists')).count, 0);
        assert.equal((await db.get('SELECT COUNT(*) AS count FROM favorites')).count, 0);

        const secondRun = await migrate(db);
        assert.deepEqual(secondRun.applied, []);
    } finally {
        await db.close();
    }
});
