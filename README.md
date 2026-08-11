# Music Hub

A full-stack web application that turns YouTube into a personal music library.
Search for tracks, save favorites, build and reorder playlists, upload your own
audio, rate songs, and play everything from a built-in queue that keeps playing
uninterrupted while you browse.

- **Live demo:** https://music-hub-8pbq.onrender.com/
- **Repository:** https://github.com/Dstarinsky/WebDevCourse-Final-Project

---

## Features

- **Account system** — register / log in with hashed passwords and server-side sessions.
- **YouTube search** — find music via the YouTube Data API and preview it in-app.
- **Favorites** — save tracks to a personal collection.
- **Playlists** — create, rename, delete, drag-and-drop reorder, and rate songs (0–10).
- **Local uploads** — add your own audio files alongside streamed tracks.
- **In-place player** — searching, adding, rating, and removing happen over `fetch`, so
  the current track never restarts; the queue auto-advances (YouTube and local audio).
- **Persistent Library ↔ Discover listening** — when navigation starts in an open
  playlist, the app swaps the Discover content in place and keeps the mounted media,
  selected song, queue state, and complete previous/play-next footer controls alive.
- **Mixed-source queue** — YouTube tracks and your own uploads are peers in one set,
  with a visible source handoff when playback crosses between them.
- **Sunwashed broadcast UI** — a compact three-region Library workspace, bottom navigation
  and a complete mini-player on mobile, bottom sheets for secondary tasks, WCAG-AA contrast,
  and full keyboard operation.

---

## Design

The interface follows `design_plan.md` — a light-only **Sunwashed Broadcast** system:
1980s retrofuturism built on brutalist structure rather than the usual
neon-hero-over-a-horizon-grid. Warm ivory, frosted broadcast-glass accents,
Syncopate display type over Chakra Petch and Share Tech Mono, hard signal notches,
and a fixed scanline field keep it bright without turning it into a generic SaaS UI.
The compact `MUSIC` + notched `HUB` broadcast wordmark carries the same visual language
without increasing the global masthead height.

The organising idea is that **saturation is a state, not decoration**: tinted lift
appears only on what is playing, focused, or just changed. YouTube and local audio
are two opposed signal channels — magenta and deep teal — never blended into an
identity gradient.

Every visual value (colour, spacing, type scale, radius, notch, shadow, duration,
easing) is a custom property in `client/css/style.css`. Motion animates only
`transform` and `opacity`, and `prefers-reduced-motion` is honoured globally. All
contrast pairs are measured and listed in the plan.

---

## Tech stack

| Layer        | Technology                                        |
| ------------ | ------------------------------------------------- |
| Runtime      | Node.js 24 LTS + Express (server-rendered)        |
| Views        | EJS + Bootstrap 5, custom CSS design system       |
| Database     | SQLite (`sqlite3`) with versioned migrations      |
| Sessions     | `express-session` + `connect-sqlite3`             |
| Auth         | `bcryptjs` password hashing                       |
| Uploads      | `multer` + `file-type` content inspection         |
| Security     | `helmet` (CSP), `csrf-sync`, `express-rate-limit` |
| External API | YouTube Data API v3                               |
| Hosting      | Render                                            |

---

## Getting started

### Prerequisites

- Node.js **24.18.x** (the deployment and CI use `.node-version`)
- A YouTube Data API v3 key ([Google Cloud Console](https://console.cloud.google.com/apis/credentials))

### 1. Install dependencies

```bash
cd Server
npm ci
```

### 2. Configure environment

Copy `Server/.env.example` to `Server/.env` and fill it in:

```env
PORT=3000
SESSION_SECRET=a-long-random-string-of-at-least-32-characters
YOUTUBE_API_KEY=your_youtube_api_key
```

Without `YOUTUBE_API_KEY` the app still runs; search returns an empty result set.
In production the server **refuses to start** without a valid `SESSION_SECRET`.

### 3. Run

```bash
npm start
```

Open **http://localhost:3000**, register an account, and start building playlists.

> Run all commands from inside the `Server/` folder — that is where `package.json` lives.

---

## Testing

The 75-test suite (Node's built-in test runner) covers
authentication, session hygiene, CSRF, per-user ownership (IDOR), input validation,
upload security, private media access, migrations/transactions, backup/restore,
rate limits, and YouTube failure handling.

```bash
cd Server
npm test             # full unit + integration suite
npm run lint         # server and browser JavaScript
npm run format:check # formatting check
npm run audit:prod   # production dependency audit
```

---

## Project structure

```
WebDevFinalProj/
├── client/                      # static assets only — never user data
│   ├── css/style.css            # design system
│   └── js/                      # home, Discover, and Library modules; no inline scripts
└── Server/
    ├── server.js                # entry: routes, middleware, startup
    ├── config.js                # validated environment-dependent configuration
    ├── policies.js              # fixed domain limits and allowlists
    ├── errors.js                # typed errors carrying HTTP status
    ├── validation.js            # reusable input validators
    ├── controllers/             # Auth, Favorite, Playlist, Media
    ├── services/                # AuthService, YouTubeService, UploadService
    ├── repositories/            # parameterized, ownership-scoped SQL
    ├── models/                  # User, Playlist, PlaylistSong, Favorite
    ├── middleware/              # auth, csrf, rateLimit, upload, errorHandler
    ├── database/                # connection, promise adapter, migrations
    ├── maintenance/             # verified backup/restore implementation
    ├── scripts/                 # backup, restore, lint, upload reconciliation
    ├── security/                # local compromised-password denylist
    ├── storage/uploads/         # uploaded audio — OUTSIDE the web root
    ├── views/                   # EJS templates + shared partials
    └── tests/                   # integration tests
```

Thin controllers delegate to services and repositories; all SQL lives in the
repository layer using parameterized queries.
See [`docs/architecture-current.md`](docs/architecture-current.md) for the implemented
request, ownership, persistence, client-navigation, and maintenance boundaries. The
editable Draw.io sources in [`docs/`](docs/) cover architecture, authentication,
activity, classes, database schema, and use cases; companion `*.model.xml` files are
kept in sync with the editable diagrams.

---

## Security

- **Ownership** enforced in SQL (`WHERE id = ? AND userId = ?`), not check-then-mutate.
- **Parameterized SQL** throughout; table/column identifiers come from an allowlist.
- **Sessions** regenerate on login (fixation defence) and store only
  `{ id, email, firstName }` — never the password hash. Cookies are `httpOnly`,
  `sameSite=lax`, and `secure` in production, under a non-default cookie name.
- **CSRF** synchronizer tokens on every state-changing route, including logout
  (which is `POST`, not `GET`).
- **Uploads** are authorized _before_ any bytes are written, validated by magic bytes
  with signature/extension agreement rather than trusting `Content-Type`, size- and quota-limited, stored
  outside the web root, and deleted along with their database rows.
- **Private media** is streamed through `GET /media/:songId` behind an ownership join —
  a random filename is obscurity, not authorization.
- **Rate limits** on authentication, search, uploads, and write routes.
- **Security headers** via helmet, including a CSP with **no `unsafe-inline` for
  scripts** and SRI on pinned Bootstrap assets — all page JavaScript lives in `client/js/`.
- **Input validation** at the route boundary: strict integers, length caps, email
  normalisation, a 15–128 character password policy, a local compromised-password
  denylist, and versioned SHA-384 + bcrypt hashing so the full accepted password is
  verified rather than silently truncated at bcrypt's 72-byte boundary.

---

## Environment variables

| Variable                                                                      | Required              | Description                                                          |
| ----------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `PORT`                                                                        | no                    | Port to listen on (default `3000`).                                  |
| `SESSION_SECRET`                                                              | **yes in production** | Signs session cookies; must be ≥ 32 chars. Startup fails without it. |
| `SESSION_SECRET_PREVIOUS`                                                     | no                    | Comma-separated prior secrets during controlled rotation.            |
| `SESSION_DB`                                                                  | no                    | Session database filename inside `SESSION_DIR`.                      |
| `SESSION_MAX_AGE_MS`                                                          | no                    | Session-cookie lifetime in milliseconds.                             |
| `YOUTUBE_API_KEY`                                                             | for search            | YouTube Data API v3 key.                                             |
| `NODE_ENV`                                                                    | production only       | `production` enables secure cookies, HSTS, and proxy trust.          |
| `DB_PATH`                                                                     | no                    | SQLite file location. Point at a persistent disk in production.      |
| `SESSION_DIR`                                                                 | no                    | Directory for the session database.                                  |
| `UPLOAD_DIR`                                                                  | no                    | Directory for uploaded audio.                                        |
| `BACKUP_DIR`                                                                  | no                    | Destination for verified application backups.                        |
| `BCRYPT_ROUNDS`, upload quotas, YouTube cache/timeout, rate-limit settings, … | no                    | See `config.js` and `.env.example`.                                  |

---

## Deployment

Configured for [Render](https://render.com) via `render.yaml`
(build: `npm ci --prefix Server`, start: `node Server/server.js`, health check `/healthz`).
Set `SESSION_SECRET` and `YOUTUBE_API_KEY` in the host's environment.

`render.yaml` uses a paid Starter service with a 1 GB persistent disk mounted at
`/var/data`. `DB_PATH`, `SESSION_DIR`, `UPLOAD_DIR`, and `BACKUP_DIR` all point below
that mount, and `numInstances` is fixed at one. SQLite must not be horizontally scaled.
For a multi-instance production service, migrate to managed Postgres, a durable
session store, and object storage instead.

### Backup, restore, and upload reconciliation

From `Server/`:

```bash
npm run backup
npm run uploads:reconcile
npm run uploads:reconcile:delete  # only after reviewing the dry-run report
```

Backups contain consistent SQLite snapshots, the session store when present, uploaded
files, and a SHA-256 manifest. Copy backups off the Render disk on a regular schedule;
a persistent disk is not an independent backup.

Restore only while the app is stopped:

```bash
npm run restore -- /absolute/path/to/music-hub-backup --confirm
```

The restore verifies the manifest first and moves current data to timestamped
`before-restore` paths instead of deleting it. After restoration, start the app, check
`/healthz`, sign in, stream one local track, and run `npm run uploads:reconcile`.

---

## Author

David Starinsky — [GitHub](https://github.com/Dstarinsky) · [LinkedIn](https://www.linkedin.com/in/david-starinsky/)
