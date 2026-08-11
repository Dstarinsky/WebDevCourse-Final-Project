#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const path = require('path');
const config = require('../config');
const db = require('../database/db');
const { createBackup } = require('../maintenance/backup');

async function main() {
    await db.init();
    const { backupDir } = await createBackup({
        databasePath: config.database.path,
        sessionPath: path.join(config.session.dir, config.session.db),
        uploadsDir: config.uploads.dir,
        destinationRoot: config.maintenance.backupDir
    });
    console.log(`Backup created and verified: ${backupDir}`);
}

main()
    .catch((err) => {
        console.error(`Backup failed: ${err.message}`);
        process.exitCode = 1;
    })
    .finally(() => db.close().catch(() => {}));
