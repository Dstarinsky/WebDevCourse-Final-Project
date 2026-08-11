const globals = require('./Server/node_modules/globals');

module.exports = [
    {
        ignores: [
            'Server/node_modules/**',
            'Server/storage/**',
            'Server/backups/**'
        ]
    },
    {
        files: ['Server/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: globals.node
        },
        rules: {
            'no-constant-binary-expression': 'error',
            'no-dupe-else-if': 'error',
            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }]
        }
    },
    {
        files: ['client/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                ...globals.browser,
                bootstrap: 'readonly',
                YT: 'readonly'
            }
        },
        rules: {
            'no-constant-binary-expression': 'error',
            'no-dupe-else-if': 'error',
            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }]
        }
    }
];
