<!-- author: claude -->
# Music Hub

A full-stack web application that turns YouTube into a personal music library.
Search for tracks, save favorites, build and reorder playlists, upload your own
MP3s, rate songs, and play everything from a built-in queue that keeps playing
uninterrupted while you browse.

- **Live demo:** https://music-hub-8pbq.onrender.com/
- **Repository:** https://github.com/Dstarinsky/WebDevCourse-Final-Project

---

## Features

- **Account system** — register / log in with hashed passwords and server-side sessions.
- **YouTube search** — find music via the YouTube Data API and preview it in-app.
- **Favorites** — save tracks to a personal collection.
- **Playlists** — create, rename, delete, drag-and-drop reorder, and rate songs (0–10).
- **Local uploads** — add your own MP3 files alongside streamed tracks.
- **In-place player** — searching, adding, rating, and removing happen over AJAX, so
  the current track never restarts; the queue auto-advances (YouTube and local audio).
- **Responsive dark UI** — mobile playlist drawer, accessible controls, WCAG-AA palette.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js + Express (server-rendered) |
| Views | EJS + Bootstrap 5, custom CSS design system |
| Database | SQLite (`sqlite3`) |
| Sessions | `express-session` + `connect-sqlite3` |
| Auth | `bcryptjs` password hashing |
| Uploads | `multer` |
| External API | YouTube Data API v3 |
| Hosting | Render |

---

## Getting started

### Prerequisites

- Node.js **18+**
- A YouTube Data API v3 key ([Google Cloud Console](https://console.cloud.google.com/apis/credentials))

### 1. Install dependencies

```bash
cd Server
npm install
```

### 2. Configure environment

Create `Server/.env` (see `Server/.env.example`):

```env
PORT=3000
SESSION_SECRET=replace-with-a-long-random-string
YOUTUBE_API_KEY=your_youtube_api_key
```

### 3. Run

```bash
npm start
```

Open **http://localhost:3000**, register an account, and start building playlists.

> Run all commands from inside the `Server/` folder (that is where `package.json` lives).

---

## Testing

An integration test suite (Node's built-in test runner, no extra dependencies)
covers authentication, route protection, per-user ownership (IDOR), and upload security.

```bash
cd Server
npm test
```

---

## Project structure

```
WebDevFinalProj/
├── client/
│   └── css/style.css            # design system (View styling)
└── Server/
    ├── server.js                # entry: routes, middleware, sessions, uploads
    ├── controllers/             # Auth, Favorite, Playlist
    ├── services/                # AuthService (validation, bcrypt)
    ├── repositories/            # User, Playlist, Favorite (parameterized SQL)
    ├── models/                  # User, Playlist, PlaylistSong, Favorite
    ├── database/db.js           # SQLite connection + schema
    ├── views/                   # EJS templates
    └── tests/                   # integration tests
```

The server follows an MVC-style layering: thin controllers delegate to services and
repositories, and all SQL lives in the repository layer using parameterized queries.

---

## Security

- Per-user ownership checks on every playlist/song route (no IDOR).
- Parameterized SQL throughout.
- `httpOnly` + `sameSite=lax` session cookies, `secure` in production.
- Server-side input validation and a hardened upload pipeline (server-generated
  filenames + audio-extension allowlist) to prevent path traversal / arbitrary writes.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | no | Port to listen on (default `3000`). |
| `SESSION_SECRET` | recommended | Secret used to sign session cookies. |
| `YOUTUBE_API_KEY` | yes (for search) | YouTube Data API v3 key. |
| `NODE_ENV` | production only | Set to `production` to enable secure cookies + proxy trust. |

---

## Deployment

Configured for [Render](https://render.com) via `render.yaml`
(build: `npm install --prefix Server`, start: `node Server/server.js`).
Set `SESSION_SECRET` and `YOUTUBE_API_KEY` in the host's environment.

---

## Author

David Starinsky — [GitHub](https://github.com/Dstarinsky) · [LinkedIn](https://www.linkedin.com/in/david-starinsky/)
