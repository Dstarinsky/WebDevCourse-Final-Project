require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('body-parser');
const multer = require('multer');
const FavoriteController = require('./controllers/FavoriteController'); 

// Configure Upload Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../client/uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- IMPORT CONTROLLERS ---
const AuthController = require('./controllers/AuthController');
const YouTubeController = require('./controllers/YouTubeController');
const PlaylistController = require('./controllers/PlaylistController');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- CONFIGURATION ---

// Set View Engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve Static Files
app.use(express.static(path.join(__dirname, '../client')));

// Parse Form Data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// --- MIDDLEWARE ---


app.use((req, res, next) => {
    if (req.path.endsWith('.html')) {
        const newPath = req.path.slice(0, -5);
        return res.redirect(301, newPath);
    }
    next();
});

// Session Configuration (Stored in SQLite database)
app.use(session({
    store: new SQLiteStore({ 
        db: 'sessions.sqlite', 
        dir: './database'      
    }),
    secret: 'your_secret_key_change_this',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24, // 24 Hours
        httpOnly: true 
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

// -- Protected Main Dashboard --
app.get('/', requireAuth, (req, res) => {
    res.render('index', { user: req.session.user });
});

// -- YouTube Favorites Routes --
app.get('/favorites', requireAuth, (req, res) => FavoriteController.index(req, res));
app.post('/favorites/add', requireAuth, (req, res) => FavoriteController.add(req, res));
app.post('/favorites/remove', requireAuth, (req, res) => FavoriteController.remove(req, res));

// -- Playlist Management Routes --
app.get('/playlists', requireAuth, (req, res) => PlaylistController.index(req, res));           // List all playlists
app.post('/playlists/create', requireAuth, (req, res) => PlaylistController.create(req, res));   // Create new
app.post('/playlists/delete', requireAuth, (req, res) => PlaylistController.delete(req, res));   // Delete playlist

app.get('/playlists/:id', requireAuth, (req, res) => PlaylistController.show(req, res));         // View Playlist + Player
app.post('/playlists/:id/add', requireAuth, (req, res) => PlaylistController.addSong(req, res)); // Add song to playlist
app.post('/playlists/:id/remove', requireAuth, (req, res) => PlaylistController.removeSong(req, res)); // Remove song
app.post('/playlists/add-from-search', requireAuth, (req, res) => PlaylistController.addFromSearch(req, res));
app.post('/playlists/:id/upload', requireAuth, upload.single('mp3file'), (req, res) => PlaylistController.uploadSong(req, res));
app.post('/playlists/rename', requireAuth, (req, res) => PlaylistController.rename(req, res));
app.post('/playlists/:id/rate', requireAuth, (req, res) => PlaylistController.rateSong(req, res));
app.post('/playlists/reorder', requireAuth, (req, res) => PlaylistController.reorder(req, res));



// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});