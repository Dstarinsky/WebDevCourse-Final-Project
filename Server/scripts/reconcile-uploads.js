#!/usr/bin/env node
require('dotenv').config({ quiet: true });

const db = require('../database/db');
const UploadService = require('../services/UploadService');

async function main() {
    const deleteOrphans = process.argv.includes('--delete');
    await db.init();
    const report = await UploadService.reconcile({ deleteOrphans });
    console.log(JSON.stringify({ mode: deleteOrphans ? 'delete' : 'dry-run', ...report }, null, 2));
    if (report.missing.length > 0) process.exitCode = 2;
}

main()
    .catch((err) => {
        console.error(`Upload reconciliation failed: ${err.message}`);
        process.exitCode = 1;
    })
    .finally(() => db.close().catch(() => {}));
