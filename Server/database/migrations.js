// Versioned, one-time migrations tracked by SQLite's `PRAGMA user_version`.
//
// The previous approach ran `CREATE TABLE IF NOT EXISTS` plus speculative
// `ALTER TABLE` statements on every boot and swallowed *every* error, not just
// "duplicate column". That meant a genuinely broken migration looked identical to
// an already-applied one. These run once, inside a transaction, and throw loudly.

// Canonical schema. `IF NOT EXISTS` is intentionally absent: a table that already
// exists is rebuilt (below) so legacy databases pick up the constraints too.
const SCHEMA = {
    users: `CREATE TABLE users (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        firstName    TEXT    NOT NULL,
        lastName     TEXT    NOT NULL DEFAULT '',
        passwordHash TEXT    NOT NULL,
        createdAt    TEXT    NOT NULL
    )`,
    playlists: `CREATE TABLE playlists (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        userId    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name      TEXT    NOT NULL,
        createdAt TEXT    NOT NULL,
        position  INTEGER NOT NULL DEFAULT 0
    )`,
    playlist_songs: `CREATE TABLE playlist_songs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        playlistId   INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        videoId      TEXT    NOT NULL,
        title        TEXT    NOT NULL,
        thumbnailUrl TEXT,
        position     INTEGER NOT NULL DEFAULT 0,
        source       TEXT    NOT NULL DEFAULT 'youtube'
                             CHECK (source IN ('youtube', 'local')),
        rating       INTEGER NOT NULL DEFAULT 0
                             CHECK (rating BETWEEN 0 AND 10),
        mimeType     TEXT,
        sizeBytes    INTEGER
    )`,
    favorites: `CREATE TABLE favorites (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        userId       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        videoId      TEXT    NOT NULL,
        title        TEXT    NOT NULL,
        thumbnailUrl TEXT,
        createdAt    TEXT    NOT NULL,
        UNIQUE (userId, videoId)
    )`
};

const INDEXES = [
    `CREATE INDEX IF NOT EXISTS idx_playlists_user     ON playlists(userId, position)`,
    `CREATE INDEX IF NOT EXISTS idx_songs_playlist     ON playlist_songs(playlistId, position)`,
    `CREATE INDEX IF NOT EXISTS idx_favorites_user     ON favorites(userId, id DESC)`
];

// Per-table copy expressions used when rebuilding a legacy table. Each entry maps a
// target column to the SQL that produces its value; `null` means "column carries
// over unchanged if it exists, otherwise use the default literal".
const COLUMN_DEFAULTS = {
    users: {
        id: 'id',
        email: 'email',
        firstName: `COALESCE(NULLIF(TRIM(firstName), ''), 'User')`,
        lastName: `COALESCE(lastName, '')`,
        passwordHash: 'passwordHash',
        createdAt: `COALESCE(createdAt, datetime('now'))`
    },
    playlists: {
        id: 'id',
        userId: 'userId',
        name: `COALESCE(NULLIF(TRIM(name), ''), 'Untitled')`,
        createdAt: `COALESCE(createdAt, datetime('now'))`,
        position: 'COALESCE(position, 0)'
    },
    playlist_songs: {
        id: 'id',
        playlistId: 'playlistId',
        videoId: 'videoId',
        title: `COALESCE(NULLIF(TRIM(title), ''), 'Untitled')`,
        // The old code stored '/images/mp3-icon.png' for local uploads, an asset that
        // never existed. Normalise it away; the view already renders its own icon.
        thumbnailUrl: `CASE WHEN thumbnailUrl = '/images/mp3-icon.png' THEN NULL ELSE thumbnailUrl END`,
        position: 'COALESCE(position, 0)',
        source: `CASE WHEN source IN ('youtube', 'local') THEN source ELSE 'youtube' END`,
        // Clamp instead of letting the new CHECK constraint reject the copy.
        rating: 'MAX(0, MIN(10, COALESCE(rating, 0)))',
        mimeType: 'mimeType',
        sizeBytes: 'sizeBytes'
    },
    favorites: {
        id: 'id',
        userId: 'userId',
        videoId: 'videoId',
        title: `COALESCE(NULLIF(TRIM(title), ''), 'Untitled')`,
        thumbnailUrl: 'thumbnailUrl',
        createdAt: `COALESCE(createdAt, datetime('now'))`
    }
};

// Literal fallbacks for target columns absent from the legacy table entirely.
const MISSING_COLUMN_LITERAL = {
    lastName: `''`,
    createdAt: `datetime('now')`,
    position: '0',
    source: `'youtube'`,
    rating: '0',
    mimeType: 'NULL',
    sizeBytes: 'NULL',
    thumbnailUrl: 'NULL'
};

/** Column names currently present on `table`, or [] when it does not exist. */
async function columnsOf(adapter, table) {
    const rows = await adapter.all(`PRAGMA table_info(${table})`);
    return rows.map((r) => r.name);
}

/** Target column names, parsed from the canonical CREATE statement. */
function targetColumns(table) {
    return Object.keys(COLUMN_DEFAULTS[table]);
}

/**
 * Bring one table to the canonical schema.
 * Fresh database  -> plain CREATE.
 * Legacy database -> create canonical `<table>__new`, copy what exists, swap.
 * SQLite cannot ALTER a column into NOT NULL/CHECK, so a rebuild is the only route.
 */
async function ensureTable(adapter, table) {
    const existing = await columnsOf(adapter, table);

    if (existing.length === 0) {
        await adapter.exec(SCHEMA[table]);
        return { created: true, rebuilt: false };
    }

    const columns = targetColumns(table);
    const present = new Set(existing);
    const selectList = columns
        .map((col) => {
            if (present.has(col)) return `${COLUMN_DEFAULTS[table][col]} AS ${col}`;
            const literal = MISSING_COLUMN_LITERAL[col];
            if (literal === undefined) {
                throw new Error(
                    `Cannot migrate ${table}: required column "${col}" is missing and has no default`
                );
            }
            return `${literal} AS ${col}`;
        })
        .join(', ');

    // Dropping duplicates is required before favorites gains UNIQUE(userId, videoId).
    const dedupe =
        table === 'favorites'
            ? `WHERE id IN (SELECT MIN(id) FROM favorites GROUP BY userId, videoId)`
            : '';

    const tempName = `${table}__migrating`;
    await adapter.exec(`DROP TABLE IF EXISTS ${tempName}`);
    await adapter.exec(SCHEMA[table].replace(`CREATE TABLE ${table}`, `CREATE TABLE ${tempName}`));
    await adapter.exec(
        `INSERT INTO ${tempName} (${columns.join(', ')}) SELECT ${selectList} FROM ${table} ${dedupe}`
    );
    await adapter.exec(`DROP TABLE ${table}`);
    await adapter.exec(`ALTER TABLE ${tempName} RENAME TO ${table}`);
    return { created: false, rebuilt: true };
}

const MIGRATIONS = [
    {
        version: 1,
        name: 'canonical-schema',
        async up(adapter) {
            // Order matters: parents before children, so the FK references resolve.
            for (const table of ['users', 'playlists', 'playlist_songs', 'favorites']) {
                await ensureTable(adapter, table);
            }
            for (const index of INDEXES) {
                await adapter.exec(index);
            }
        }
    },
    {
        version: 2,
        name: 'purge-orphaned-rows',
        /**
         * Delete rows whose parent no longer exists.
         *
         * Legacy databases can contain them: the old code enabled
         * `PRAGMA foreign_keys` inside the connection callback without awaiting it, so
         * early deletes could run before ON DELETE CASCADE was actually in force. The
         * v1 rebuild copies rows verbatim, which carried those orphans into the
         * constrained schema and made `foreign_key_check` fail — leaving the app
         * unable to boot with no recovery path.
         *
         * Deleting is the only correct repair: the parent is gone, so the row is
         * unreachable data that nothing can render or own.
         */
        async up(adapter) {
            // Children before parents, so cascading orphans resolve in one pass.
            const songs = await adapter.run(
                `DELETE FROM playlist_songs
                 WHERE playlistId NOT IN (SELECT id FROM playlists)`
            );
            const favorites = await adapter.run(
                `DELETE FROM favorites
                 WHERE userId NOT IN (SELECT id FROM users)`
            );
            const playlists = await adapter.run(
                `DELETE FROM playlists
                 WHERE userId NOT IN (SELECT id FROM users)`
            );
            // Deleting a playlist can orphan its songs; sweep once more.
            const cascaded = await adapter.run(
                `DELETE FROM playlist_songs
                 WHERE playlistId NOT IN (SELECT id FROM playlists)`
            );

            const removed =
                songs.changes + favorites.changes + playlists.changes + cascaded.changes;
            if (removed > 0) {
                console.warn(
                    `Migration 2 removed ${removed} orphaned row(s) left by the pre-migration schema.`
                );
            }
        }
    }
];

/** Apply every migration newer than the database's recorded user_version. */
async function migrate(adapter, { log = false } = {}) {
    const { user_version: current } = await adapter.get('PRAGMA user_version');
    const pending = MIGRATIONS.filter((m) => m.version > current);
    if (pending.length === 0) return { applied: [], version: current };

    // Foreign keys must be off while tables are swapped, and toggling the pragma is
    // a no-op inside a transaction — so it is set around the whole batch.
    await adapter.run('PRAGMA foreign_keys = OFF');
    try {
        for (const migration of pending) {
            await adapter.transaction(async () => {
                await migration.up(adapter);
                // PRAGMA does not accept bound parameters.
                await adapter.run(`PRAGMA user_version = ${migration.version}`);
            });
            if (log) console.log(`Applied migration ${migration.version}: ${migration.name}`);
        }
    } finally {
        await adapter.run('PRAGMA foreign_keys = ON');
    }

    const violations = await adapter.all('PRAGMA foreign_key_check');
    if (violations.length > 0) {
        throw new Error(`Migration left ${violations.length} foreign key violation(s)`);
    }

    return { applied: pending.map((m) => m.version), version: pending.at(-1).version };
}

module.exports = { migrate, MIGRATIONS };
