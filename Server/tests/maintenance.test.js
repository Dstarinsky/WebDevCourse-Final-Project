const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { createAdapter } = require('../database/sqlite');
const { createBackup, restoreBackup, validateBackup } = require('../maintenance/backup');

async function createDatabase(filename, value) {
    const db = createAdapter(new sqlite3.Database(filename));
    await db.run('CREATE TABLE state (value TEXT NOT NULL)');
    await db.run('INSERT INTO state (value) VALUES (?)', [value]);
    await db.close();
}

async function readValue(filename) {
    const db = createAdapter(new sqlite3.Database(filename, sqlite3.OPEN_READONLY));
    try {
        return (await db.get('SELECT value FROM state')).value;
    } finally {
        await db.close();
    }
}

test('backup and restore preserve database, sessions, and uploaded files', async (t) => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'musichub-maintenance-'));
    t.after(() => fsp.rm(root, { recursive: true, force: true }));
    const databasePath = path.join(root, 'app.sqlite');
    const sessionPath = path.join(root, 'sessions.sqlite');
    const uploadsDir = path.join(root, 'uploads');
    const destinationRoot = path.join(root, 'backups');

    await createDatabase(databasePath, 'before');
    await createDatabase(sessionPath, 'session-before');
    await fsp.mkdir(uploadsDir);
    await fsp.writeFile(path.join(uploadsDir, 'track.mp3'), 'audio-before');

    const { backupDir } = await createBackup({
        databasePath,
        sessionPath,
        uploadsDir,
        destinationRoot
    });
    await validateBackup(backupDir);

    await fsp.rm(databasePath);
    await createDatabase(databasePath, 'after');
    await fsp.rm(sessionPath);
    await createDatabase(sessionPath, 'session-after');
    await fsp.writeFile(path.join(uploadsDir, 'track.mp3'), 'audio-after');

    const result = await restoreBackup({ backupDir, databasePath, sessionPath, uploadsDir });
    assert.ok(result.rollbacks.length >= 3, 'previous data should remain recoverable');
    assert.equal(await readValue(databasePath), 'before');
    assert.equal(await readValue(sessionPath), 'session-before');
    assert.equal(await fsp.readFile(path.join(uploadsDir, 'track.mp3'), 'utf8'), 'audio-before');
});

test('backup validation rejects modified content', async (t) => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'musichub-backup-integrity-'));
    t.after(() => fsp.rm(root, { recursive: true, force: true }));
    const databasePath = path.join(root, 'app.sqlite');
    const uploadsDir = path.join(root, 'uploads');
    await createDatabase(databasePath, 'trusted');
    await fsp.mkdir(uploadsDir);

    const { backupDir } = await createBackup({
        databasePath,
        sessionPath: path.join(root, 'missing-sessions.sqlite'),
        uploadsDir,
        destinationRoot: path.join(root, 'backups')
    });
    fs.appendFileSync(path.join(backupDir, 'database.sqlite'), 'tampered');
    await assert.rejects(validateBackup(backupDir), /integrity check failed/i);
});
