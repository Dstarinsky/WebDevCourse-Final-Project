// dotenv is loaded exactly once, here at the executable entry point, and before
// config.js reads process.env. The controllers used to re-load it redundantly.
require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const SQLiteStore = require('connect-sqlite3')(session);

const config = require('./config');
const db = require('./database/db');

const AuthController = require('./controllers/AuthController');
const FavoriteController = require('./controllers/FavoriteController');
const PlaylistController = require('./controllers/PlaylistController');
const MediaController = require('./controllers/MediaController');

const { asyncHandler, errorHandler, notFound } = require('./middleware/errorHandler');
const { requireAuth, exposeUser, loadOwnedPlaylist } = require('./middleware/auth');
const { csrfProtection, exposeCsrfToken } = require('./middleware/csrf');
const {
    authLimiter,
    searchLimiter,
    searchPageLimiter,
    uploadLimiter,
    writeLimiter
} = require('./middleware/rateLimit');
const { uploadSingleAudio } = require('./middleware/upload');

const app = express();

// --- VIEW ENGINE ----------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Safe, non-secret settings every template can read, so views stop hardcoding CDN
// URLs, the brand name, and policy values like the password minimum.
app.locals.config = config.publicView;

// Trust the platform proxy (Render) so secure cookies and client IPs resolve
// correctly behind TLS termination. Set before any IP-based rate limiting.
if (config.isProduction) app.set('trust proxy', 1);

// --- SECURITY HEADERS -----------------------------------------------------
const { origins } = config.cdn;
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                // All page behaviour lives in /js/*.js files, so no 'unsafe-inline' is
                // needed for scripts — that is the payoff for extracting them from EJS.
                scriptSrc: ["'self'", ...origins.script],
                // Bootstrap components still set element styles at runtime.
                styleSrc: ["'self'", "'unsafe-inline'", ...origins.style],
                fontSrc: ["'self'", 'data:', ...origins.font],
                imgSrc: ["'self'", 'data:', ...origins.img],
                mediaSrc: ["'self'"],
                frameSrc: origins.frame,
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                ...(config.isProduction ? { upgradeInsecureRequests: [] } : {})
            }
        },
        // YouTube's embedded player needs a non-isolating cross-origin policy.
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false
    })
);

// --- STATIC + BODY PARSING ------------------------------------------------
// `client/` holds only CSS and JS now. Uploads live outside the web root and are
// streamed through GET /media/:songId after an ownership check.
app.use(
    express.static(path.join(__dirname, '../client'), {
        maxAge: config.isProduction ? '1d' : 0
    })
);

// Explicit body limits — the defaults are generous for a form-driven app.
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(express.json({ limit: '32kb' }));

// --- SESSIONS -------------------------------------------------------------
app.use(
    session({
        name: config.session.cookieName,
        store: new SQLiteStore({ db: config.session.db, dir: config.session.dir }),
        secret: config.session.secret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: config.session.maxAgeMs,
            httpOnly: true,
            sameSite: 'lax',
            secure: config.isProduction
        }
    })
);

app.use(exposeUser);
app.use(exposeCsrfToken);

// --- HEALTH ---------------------------------------------------------------
// Proves the datastore answers, not merely that the process is listening.
app.get(
    '/healthz',
    asyncHandler(async (req, res) => {
        await db.ping();
        res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
    })
);

app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- ROUTES ---------------------------------------------------------------
const route = (controller, method) =>
    asyncHandler((req, res, next) => controller[method](req, res, next));

// Authentication
app.get('/login', route(AuthController, 'showLogin'));
app.post('/login', authLimiter, csrfProtection, route(AuthController, 'login'));
app.get('/register', route(AuthController, 'showRegister'));
app.post('/register', authLimiter, csrfProtection, route(AuthController, 'register'));
// POST, not GET: a GET logout is triggerable by any third-party <img> tag.
app.post('/logout', csrfProtection, route(AuthController, 'logout'));

// Home
app.get('/', (req, res) => {
    res.render('index', {
        title: `${config.branding.appName} — your personal music library`,
        user: req.session.user || null
    });
});

// Favorites
app.get('/favorites', requireAuth, searchPageLimiter, route(FavoriteController, 'index'));
app.post(
    '/favorites/add',
    requireAuth,
    writeLimiter,
    csrfProtection,
    route(FavoriteController, 'add')
);
app.post(
    '/favorites/remove',
    requireAuth,
    writeLimiter,
    csrfProtection,
    route(FavoriteController, 'remove')
);

// JSON API
app.get('/api/search', requireAuth, searchLimiter, route(PlaylistController, 'apiSearch'));

// Private media
app.get('/media/:songId', requireAuth, route(MediaController, 'stream'));

// Playlists — collection routes
app.get('/playlists', requireAuth, route(PlaylistController, 'index'));
app.post(
    '/playlists/create',
    requireAuth,
    writeLimiter,
    csrfProtection,
    route(PlaylistController, 'create')
);
app.post(
    '/playlists/reorder',
    requireAuth,
    writeLimiter,
    csrfProtection,
    route(PlaylistController, 'reorder')
);
app.post(
    '/playlists/add-from-search',
    requireAuth,
    writeLimiter,
    csrfProtection,
    route(PlaylistController, 'addFromSearch')
);
// `id` arrives in the body for these two, which loadOwnedPlaylist also accepts.
app.post(
    '/playlists/delete',
    requireAuth,
    writeLimiter,
    csrfProtection,
    loadOwnedPlaylist,
    route(PlaylistController, 'delete')
);
app.post(
    '/playlists/rename',
    requireAuth,
    writeLimiter,
    csrfProtection,
    loadOwnedPlaylist,
    route(PlaylistController, 'rename')
);

// Playlists — member routes. loadOwnedPlaylist resolves and authorises `:id` once.
app.get(
    '/playlists/:id',
    requireAuth,
    searchPageLimiter,
    loadOwnedPlaylist,
    route(PlaylistController, 'show')
);
app.post(
    '/playlists/:id/add',
    requireAuth,
    writeLimiter,
    csrfProtection,
    loadOwnedPlaylist,
    route(PlaylistController, 'addSong')
);
app.post(
    '/playlists/:id/remove',
    requireAuth,
    writeLimiter,
    csrfProtection,
    loadOwnedPlaylist,
    route(PlaylistController, 'removeSong')
);
app.post(
    '/playlists/:id/rate',
    requireAuth,
    writeLimiter,
    csrfProtection,
    loadOwnedPlaylist,
    route(PlaylistController, 'rateSong')
);
// Ordering here is deliberate:
//   1. requireAuth + uploadLimiter  — reject anonymous and abusive callers immediately.
//   2. loadOwnedPlaylist            — authorise BEFORE multer accepts or writes bytes,
//                                     so an upload aimed at someone else's playlist
//                                     never touches the disk.
//   3. uploadSingleAudio            — parse the multipart body.
//   4. csrfProtection               — the token travels *inside* that body, so it can
//                                     only be verified once multer has parsed it. A
//                                     rejection here leaves a temp file, which the
//                                     error handler unlinks.
app.post(
    '/playlists/:id/upload',
    requireAuth,
    uploadLimiter,
    loadOwnedPlaylist,
    uploadSingleAudio,
    csrfProtection,
    route(PlaylistController, 'uploadSong')
);

// --- 404 + ERRORS ---------------------------------------------------------
// A real 404 (page or JSON), not the old blanket redirect that hid every typo.
app.use(notFound);
app.use(errorHandler);

// --- STARTUP --------------------------------------------------------------
async function start() {
    // Schema and migrations complete before the first request can arrive.
    await db.init();
    return new Promise((resolve) => {
        const server = app.listen(config.port, () => {
            console.log(`${config.branding.appName} running at http://localhost:${config.port}`);
            resolve(server);
        });
    });
}

if (require.main === module) {
    start().catch((err) => {
        console.error('Failed to start:', err.message);
        process.exit(1);
    });
}

module.exports = app;
module.exports.start = start;
module.exports.ready = () => db.init();
