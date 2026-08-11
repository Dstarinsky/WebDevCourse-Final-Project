const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3');

const MANIFEST_NAME = 'manifest.json';

const exists = async (target) =>
    fsp.access(target).then(
        () => true,
        () => false
    );

function close(database) {
    return new Promise((resolve, reject) => {
        database.close((err) => (err ? reject(err) : resolve()));
    });
}

/** Create a consistent SQLite snapshot, including committed WAL state. */
async function snapshotSqlite(sourcePath, targetPath) {
    if (!(await exists(sourcePath))) return false;
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    const database = await new Promise((resolve, reject) => {
        const opened = new sqlite3.Database(sourcePath, sqlite3.OPEN_READONLY, (err) => {
            if (err) reject(err);
            else resolve(opened);
        });
    });
    try {
        await new Promise((resolve, reject) => {
            database.run('VACUUM INTO ?', [targetPath], (err) => (err ? reject(err) : resolve()));
        });
    } finally {
        await close(database);
    }
    return true;
}

async function hashFile(filename) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filename);
    for await (const chunk of stream) hash.update(chunk);
    const stats = await fsp.stat(filename);
    return { bytes: stats.size, sha256: hash.digest('hex') };
}

async function inventory(root, relative = '') {
    const directory = path.join(root, relative);
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    const files = {};
    for (const entry of entries) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) Object.assign(files, await inventory(root, child));
        else if (entry.isFile() && child !== MANIFEST_NAME) {
            files[child] = await hashFile(path.join(root, child));
        }
    }
    return files;
}

async function createBackup({ databasePath, sessionPath, uploadsDir, destinationRoot }) {
    const timestamp = new Date().toISOString();
    await fsp.mkdir(destinationRoot, { recursive: true });
    const backupDir = path.join(destinationRoot, `music-hub-${timestamp.replace(/[:.]/g, '-')}`);
    // recursive:true so a first backup also creates the destination root, which
    // otherwise does not exist on a fresh deployment or in a temp test directory.
    await fsp.mkdir(backupDir, { recursive: true });

    if (!(await snapshotSqlite(databasePath, path.join(backupDir, 'database.sqlite')))) {
        throw new Error(`Application database does not exist: ${databasePath}`);
    }
    await snapshotSqlite(sessionPath, path.join(backupDir, 'sessions.sqlite'));

    const uploadBackup = path.join(backupDir, 'uploads');
    if (await exists(uploadsDir)) {
        await fsp.cp(uploadsDir, uploadBackup, { recursive: true, force: false });
    } else {
        await fsp.mkdir(uploadBackup);
    }

    const manifest = {
        format: 1,
        createdAt: timestamp,
        files: await inventory(backupDir)
    };
    await fsp.writeFile(
        path.join(backupDir, MANIFEST_NAME),
        `${JSON.stringify(manifest, null, 2)}\n`,
        { flag: 'wx', mode: 0o600 }
    );
    return { backupDir, manifest };
}

async function validateBackup(backupDir) {
    const manifest = JSON.parse(await fsp.readFile(path.join(backupDir, MANIFEST_NAME), 'utf8'));
    if (manifest.format !== 1 || !manifest.files || typeof manifest.files !== 'object') {
        throw new Error('Unsupported or malformed backup manifest');
    }
    for (const [relative, expected] of Object.entries(manifest.files)) {
        const resolvedRoot = path.resolve(backupDir);
        const resolved = path.resolve(resolvedRoot, relative);
        if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
            throw new Error(`Backup manifest contains an unsafe path: ${relative}`);
        }
        const actual = await hashFile(resolved);
        if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
            throw new Error(`Backup integrity check failed for ${relative}`);
        }
    }
    return manifest;
}

async function moveAside(target, suffix, rollbacks) {
    if (!(await exists(target))) return;
    const rollback = `${target}.before-restore-${suffix}`;
    await fsp.rename(target, rollback);
    rollbacks.push({ target, rollback });
}

async function installFile(source, target, suffix, rollbacks) {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await moveAside(target, suffix, rollbacks);
    await moveAside(`${target}-wal`, suffix, rollbacks);
    await moveAside(`${target}-shm`, suffix, rollbacks);
    const temporary = `${target}.restore-${process.pid}.tmp`;
    await fsp.copyFile(source, temporary, fs.constants.COPYFILE_EXCL);
    await fsp.rename(temporary, target);
}

/**
 * Restore while the application is stopped. Existing files are moved aside rather
 * than deleted so an operator can roll back the restore manually.
 */
async function restoreBackup({ backupDir, databasePath, sessionPath, uploadsDir }) {
    await validateBackup(backupDir);
    const suffix = new Date().toISOString().replace(/[:.]/g, '-');
    const rollbacks = [];

    await installFile(path.join(backupDir, 'database.sqlite'), databasePath, suffix, rollbacks);
    const sessionBackup = path.join(backupDir, 'sessions.sqlite');
    if (await exists(sessionBackup)) {
        await installFile(sessionBackup, sessionPath, suffix, rollbacks);
    }

    await moveAside(uploadsDir, suffix, rollbacks);
    await fsp.mkdir(path.dirname(uploadsDir), { recursive: true });
    await fsp.cp(path.join(backupDir, 'uploads'), uploadsDir, {
        recursive: true,
        force: false
    });
    return { rollbacks };
}

module.exports = { createBackup, restoreBackup, snapshotSqlite, validateBackup };
