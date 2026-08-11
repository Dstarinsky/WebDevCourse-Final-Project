#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');
const eslintRoot = path.dirname(require.resolve('eslint/package.json'));
const eslintBin = path.join(eslintRoot, 'bin', 'eslint.js');
const result = spawnSync(process.execPath, [eslintBin, 'Server', 'client/js', '--max-warnings=0'], {
    cwd: projectRoot,
    stdio: 'inherit'
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
