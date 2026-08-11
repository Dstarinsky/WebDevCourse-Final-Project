#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const path = require('path');
const config = require('../config');
const { restoreBackup } = require('../maintenance/backup');

async function main() {
    const backupArg = process.argv.slice(2).find((value) => !value.startsWith('--'));
    if (!backupArg || !process.argv.includes('--confirm')) {
        throw new Error(
            'Stop the app, then run: npm run restore -- /absolute/path/to/backup --confirm'
        );
    }
    const backupDir = path.resolve(backupArg);
    const { rollbacks } = await restoreBackup({
        backupDir,
        databasePath: config.database.path,
        sessionPath: path.join(config.session.dir, config.session.db),
        uploadsDir: config.uploads.dir
    });
    console.log(`Restore completed from ${backupDir}`);
    console.log(`Previous data was retained in ${rollbacks.length} rollback path(s).`);
}

main().catch((err) => {
    console.error(`Restore failed: ${err.message}`);
    process.exitCode = 1;
});
