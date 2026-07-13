// author: claude
require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const multer = require('multer');

// --- IMPORT CONTROLLERS ---
const AuthController = require('./controllers/AuthController');
const FavoriteController = require('./controllers/FavoriteController');
const PlaylistController = require('./controllers/PlaylistController');

// Configure Upload Storage
// SECURITY: never reuse the client-supplied originalname in the on-disk path
// (path traversal -> arbitrary file write). The stored name is fully
// server-generated; only a vetted extension from an allowlist is carried over.
const crypto = require('crypto');
const fs = require('fs');
const ALLOWED_AUDIO_EXT = new Set(['.mp3', '.m4a', '.ogg', '.oga', '.wav', '.flac', '.aac']);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../client/uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safeExt = ALLOWED_AUDIO_EXT.has(ext) ? ext : '.mp3';
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB cap
    fileFilter: (req, file, cb) => {
        // Accept only audio uploads with an allowlisted extension. This blocks
        // .html/.ejs/.js (stored XSS / template-overwrite RCE) regardless of the
        // (spoofable) mimetype.
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, file.mimetype.startsWith('audio/') && ALLOWED_AUDIO_EXT.has(ext));
    }
});

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- CONFIGURATION ---

// Set View Engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Trust the platform proxy (Render/Heroku) so secure cookies work behind TLS
if (isProduction) app.set('trust proxy', 1);

// Serve Static Files
app.use(express.static(path.join(__dirname, '../client')));

// Parse Form Data (express built-ins replace the deprecated body-parser package)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- MIDDLEWARE ---

// Redirect legacy ".html" URLs to their extensionless route
app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        return res.redirect(301, req.path.slice(0, -5));
    }
    next();
});

// Session Configuration (Stored in SQLite database)
app.use(session({
    store: new SQLiteStore({
        db: process.env.SESSION_DB || 'sessions.sqlite',
        dir: process.env.SESSION_DIR || path.join(__dirname, 'database')
    }),
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24 Hours
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction
    }
}));

// Auth Protection Middleware
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    // Make user data available to all views automatically
    res.locals.user = req.session.user;
    next();
};

// --- ROUTES (MVC Architecture) ---

// -- Authentication Routes --
app.get('/login', (req, res) => AuthController.showLogin(req, res));
app.post('/login', (req, res) => AuthController.login(req, res));

app.get('/register', (req, res) => AuthController.showRegister(req, res));
app.post('/register', (req, res) => AuthController.register(req, res));

app.get('/logout', (req, res) => AuthController.logout(req, res));

// -- Home / Dashboard --
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user || null });
});

// -- YouTube Favorites Routes --
app.get('/favorites', requireAuth, (req, res) => FavoriteController.index(req, res));
app.post('/favorites/add', requireAuth, (req, res) => FavoriteController.add(req, res));
app.post('/favorites/remove', requireAuth, (req, res) => FavoriteController.remove(req, res));

// -- JSON API (used by in-page AJAX so playback isn't interrupted) --
app.get('/api/search', requireAuth, (req, res) => PlaylistController.apiSearch(req, res));

// -- Playlist Management Routes --
app.get('/playlists', requireAuth, (req, res) => PlaylistController.index(req, res));           // List all playlists
app.post('/playlists/create', requireAuth, (req, res) => PlaylistController.create(req, res));   // Create new
app.post('/playlists/delete', requireAuth, (req, res) => PlaylistController.delete(req, res));   // Delete playlist
app.post('/playlists/reorder', requireAuth, (req, res) => PlaylistController.reorder(req, res));
app.post('/playlists/rename', requireAuth, (req, res) => PlaylistController.rename(req, res));
app.post('/playlists/add-from-search', requireAuth, (req, res) => PlaylistController.addFromSearch(req, res));

app.get('/playlists/:id', requireAuth, (req, res) => PlaylistController.show(req, res));         // View Playlist + Player
app.post('/playlists/:id/add', requireAuth, (req, res) => PlaylistController.addSong(req, res)); // Add song to playlist
app.post('/playlists/:id/remove', requireAuth, (req, res) => PlaylistController.removeSong(req, res)); // Remove song
app.post('/playlists/:id/upload', requireAuth, upload.single('mp3file'), (req, res) => PlaylistController.uploadSong(req, res));
app.post('/playlists/:id/rate', requireAuth, (req, res) => PlaylistController.rateSong(req, res));

// --- 404 Fallback ---
app.use((req, res) => {
    res.redirect(req.session && req.session.userId ? '/playlists' : '/');
});

// --- START SERVER ---
// Only listen when run directly; tests import `app` without binding a port.
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;
