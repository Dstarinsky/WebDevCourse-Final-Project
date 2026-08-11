// SQLite connection + startup sequencing.
//
// The old module built its schema inside the connection callback but exported the
// handle immediately, so the first requests could race the CREATE TABLE statements.
// `init()` now returns a promise the server awaits before it binds a port.
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const config = require('../config');
const { createAdapter } = require('./sqlite');
const { migrate } = require('./migrations');

fs.mkdirSync(path.dirname(config.database.path), { recursive: true });

const db = new sqlite3.Database(config.database.path);
const adapter = createAdapter(db);

let initPromise = null;

/** Idempotent: concurrent callers share one initialisation. */
function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        // No db.serialize() here: the adapter awaits each statement before issuing the
        // next, which already guarantees ordering. Turning on node-sqlite3's serialized
        // mode as well deadlocks exec() inside a transaction.
        db.configure('busyTimeout', config.database.busyTimeoutMs);

        // ON DELETE CASCADE is inert without this, and it is per-connection.
        await adapter.run('PRAGMA foreign_keys = ON');
        // WAL lets reads proceed during a write. Skipped under test: the suite uses
        // short-lived throwaway databases and WAL leaves extra -wal/-shm files behind.
        if (!config.isTest) {
            await adapter.run('PRAGMA journal_mode = WAL');
        }

        await migrate(adapter, { log: !config.isTest });

        if (!config.isTest) {
            console.log(`Connected to SQLite database at ${config.database.path}`);
        }
        return adapter;
    })();

    return initPromise;
}

/** Cheap liveness probe for /healthz — proves the datastore answers, not just the process. */
async function ping() {
    await adapter.get('SELECT 1 AS ok');
    return true;
}

module.exports = {
    ...adapter,
    raw: db,
    init,
    ping
};
