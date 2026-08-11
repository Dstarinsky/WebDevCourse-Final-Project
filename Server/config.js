// Single validated source of truth for environment-dependent settings and domain
// policy. Loaded once at startup; throws before the server binds a port if a
// production deployment is missing something it must not run without.
const path = require('path');
const policies = require('./policies');

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';
const isTest = env === 'test';

// --- fail-fast validation -------------------------------------------------
// A missing SESSION_SECRET used to fall back to a string published in the public
// repo, so a production deploy that forgot the variable signed every session with
// a known key and still booted "successfully".
const DEV_SESSION_SECRET = 'dev-only-insecure-secret-change-me';
const MIN_SECRET_LENGTH = 32;

function resolveSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (isProduction) {
        if (!secret) {
            throw new Error('SESSION_SECRET is required when NODE_ENV=production');
        }
        if (secret.length < MIN_SECRET_LENGTH) {
            throw new Error(
                `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters (got ${secret.length})`
            );
        }
        if (secret === DEV_SESSION_SECRET) {
            throw new Error('SESSION_SECRET must not be the development default in production');
        }
        return secret;
    }
    return secret || DEV_SESSION_SECRET;
}

function resolveSessionSecrets() {
    const current = resolveSessionSecret();
    const previous = String(process.env.SESSION_SECRET_PREVIOUS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (isProduction) {
        for (const secret of previous) {
            if (secret.length < MIN_SECRET_LENGTH || secret === DEV_SESSION_SECRET) {
                throw new Error(
                    `Every SESSION_SECRET_PREVIOUS value must be at least ${MIN_SECRET_LENGTH} characters`
                );
            }
        }
    }
    return previous.length > 0 ? [current, ...previous] : current;
}

function positiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const dataDir = path.join(__dirname, 'database');

const config = {
    env,
    isProduction,
    isTest,
    port: positiveInt(process.env.PORT, 3000),

    database: {
        // DB_PATH/SESSION_DIR/UPLOAD_DIR are deliberately env-driven so pointing the
        // deployment at a persistent disk is a configuration change, not a code change.
        path: process.env.DB_PATH
            ? path.resolve(process.env.DB_PATH)
            : path.join(dataDir, 'music_app.sqlite'),
        // SQLite serializes writers; wait rather than failing fast under contention.
        busyTimeoutMs: positiveInt(process.env.DB_BUSY_TIMEOUT_MS, 5000)
    },

    session: {
        // express-session signs with the first value and verifies against the rest,
        // which permits rotation without invalidating every active session at once.
        secret: resolveSessionSecrets(),
        // Non-default name so the cookie does not advertise the framework.
        cookieName: process.env.SESSION_COOKIE_NAME || 'musichub.sid',
        dir: process.env.SESSION_DIR || dataDir,
        db: process.env.SESSION_DB || 'sessions.sqlite',
        maxAgeMs: positiveInt(process.env.SESSION_MAX_AGE_MS, 1000 * 60 * 60 * 24)
    },

    auth: {
        // One owner for the minimum. `register.ejs` renders its `minlength` from this
        // value, so the client and server cannot drift apart.
        minPasswordLength: policies.auth.minPasswordLength,
        // New passwords are SHA-384 pre-hashed before bcrypt, so the complete value
        // participates in verification instead of being silently truncated at
        // bcrypt's 72-byte boundary. A 128-character ceiling comfortably exceeds
        // NIST's required support for at least 64 characters while bounding work.
        maxPasswordLength: policies.auth.maxPasswordLength,
        maxPasswordBytes: policies.auth.maxPasswordBytes,
        maxEmailLength: policies.auth.maxEmailLength,
        maxNameLength: policies.auth.maxNameLength,
        bcryptRounds: positiveInt(process.env.BCRYPT_ROUNDS, isTest ? 4 : 10)
    },

    rating: policies.rating,

    playlists: policies.playlists,

    uploads: {
        // Outside the static web root: uploads are private and streamed through an
        // ownership check (GET /media/:songId), never served by express.static.
        dir: process.env.UPLOAD_DIR || path.join(__dirname, 'storage', 'uploads'),
        maxBytes: positiveInt(process.env.UPLOAD_MAX_BYTES, policies.uploads.defaultMaxBytes),
        maxTitleLength: policies.uploads.maxTitleLength,
        // Per-user quota: without one, a 25 MB limit plus an authenticated session is
        // an unbounded disk-exhaustion path.
        maxFilesPerUser: positiveInt(
            process.env.UPLOAD_MAX_FILES_PER_USER,
            policies.uploads.defaultMaxFilesPerUser
        ),
        maxBytesPerUser: positiveInt(
            process.env.UPLOAD_MAX_BYTES_PER_USER,
            policies.uploads.defaultMaxBytesPerUser
        ),
        // Extension -> MIME. The extension is only a hint; the stored MIME comes from
        // the file's magic bytes (see UploadValidationService).
        allowedTypes: policies.uploads.allowedTypes
    },

    maintenance: {
        backupDir: process.env.BACKUP_DIR || path.join(__dirname, 'backups')
    },

    youtube: {
        apiKey: process.env.YOUTUBE_API_KEY || '',
        searchUrl: policies.youtube.searchUrl,
        maxResults: policies.youtube.maxResults,
        defaultResults: policies.youtube.defaultResults,
        maxQueryLength: policies.youtube.maxQueryLength,
        timeoutMs: positiveInt(process.env.YOUTUBE_TIMEOUT_MS, 5000),
        cacheTtlMs: positiveInt(process.env.YOUTUBE_CACHE_TTL_MS, 5 * 60 * 1000),
        cacheMaxEntries: positiveInt(process.env.YOUTUBE_CACHE_MAX_ENTRIES, 100),
        // YouTube video IDs are exactly 11 chars of [A-Za-z0-9_-].
        videoIdPattern: policies.youtube.videoIdPattern,
        maxTitleLength: policies.youtube.maxTitleLength,
        allowedThumbnailHosts: policies.youtube.allowedThumbnailHosts
    },

    rateLimits: {
        // Disabled under test so the suite is not throttled by its own fixtures.
        enabled: !isTest || process.env.RATE_LIMITS_ENABLED === 'true',
        auth: {
            windowMs: positiveInt(process.env.AUTH_RATE_WINDOW_MS, 15 * 60 * 1000),
            max: positiveInt(process.env.AUTH_RATE_MAX, 10)
        },
        search: {
            windowMs: positiveInt(process.env.SEARCH_RATE_WINDOW_MS, 60 * 1000),
            max: positiveInt(process.env.SEARCH_RATE_MAX, 30)
        },
        upload: {
            windowMs: positiveInt(process.env.UPLOAD_RATE_WINDOW_MS, 60 * 60 * 1000),
            max: positiveInt(process.env.UPLOAD_RATE_MAX, 30)
        },
        write: {
            windowMs: positiveInt(process.env.WRITE_RATE_WINDOW_MS, 60 * 1000),
            max: positiveInt(process.env.WRITE_RATE_MAX, 120)
        }
    },

    branding: {
        appName: 'Music Hub',
        github: 'https://github.com/Dstarinsky',
        linkedin: 'https://www.linkedin.com/in/david-starinsky/'
    },

    // Third-party origins the CSP must allow. Kept beside the CDN URLs the layout
    // partial renders so the two cannot drift.
    cdn: {
        bootstrapCss: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
        bootstrapCssIntegrity:
            'sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM',
        bootstrapJs: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
        bootstrapJsIntegrity:
            'sha384-geWF76RCwLtnZ8qwWowPQNguL3RmwHVBC9FhGdlKrxdiJJigb/j/68SIy3Te4Bkz',
        bootstrapIcons:
            'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css',
        bootstrapIconsIntegrity:
            'sha384-l4UPAMHGzl7zwogLW4nOwaU2XTk6oiM1jhCRQstZEndoIiA2I5bg6fST3wzBSRBD',
        // Outrun Broadcast pairing: Syncopate (wide display), Chakra Petch (angular
        // UI), Share Tech Mono (readouts). display=swap so text never blocks paint.
        fontsCss:
            'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Share+Tech+Mono&family=Syncopate:wght@400;700&display=swap',
        origins: {
            script: ['https://cdn.jsdelivr.net', 'https://www.youtube.com', 'https://s.ytimg.com'],
            style: ['https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
            font: ['https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
            img: ['https://i.ytimg.com', 'https://img.youtube.com', 'https://i9.ytimg.com'],
            frame: ['https://www.youtube.com', 'https://www.youtube-nocookie.com']
        }
    }
};

// Values safe to expose to every EJS template via app.locals. Deliberately a
// projection, not the whole config — secrets and filesystem paths stay server-side.
config.publicView = {
    appName: config.branding.appName,
    github: config.branding.github,
    linkedin: config.branding.linkedin,
    cdn: {
        bootstrapCss: config.cdn.bootstrapCss,
        bootstrapCssIntegrity: config.cdn.bootstrapCssIntegrity,
        bootstrapJs: config.cdn.bootstrapJs,
        bootstrapJsIntegrity: config.cdn.bootstrapJsIntegrity,
        bootstrapIcons: config.cdn.bootstrapIcons,
        bootstrapIconsIntegrity: config.cdn.bootstrapIconsIntegrity,
        fontsCss: config.cdn.fontsCss
    },
    auth: {
        minPasswordLength: config.auth.minPasswordLength,
        maxPasswordLength: config.auth.maxPasswordLength,
        maxEmailLength: config.auth.maxEmailLength,
        maxNameLength: config.auth.maxNameLength
    },
    rating: config.rating,
    playlists: config.playlists,
    uploads: {
        maxBytes: config.uploads.maxBytes,
        maxTitleLength: config.uploads.maxTitleLength,
        acceptAttribute: Object.keys(config.uploads.allowedTypes).join(',')
    },
    youtube: { maxQueryLength: config.youtube.maxQueryLength }
};

module.exports = config;
