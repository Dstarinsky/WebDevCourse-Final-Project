# Music Hub — Project Context

Server-rendered Node.js/Express app that turns YouTube into a personal music library:
account system, YouTube search, favorites, playlists (drag-reorder, 0–10 ratings), local
audio uploads, and a continuous in-page player queue.

- **Live:** https://music-hub-8pbq.onrender.com/
- **Repo:** https://github.com/Dstarinsky/WebDevCourse-Final-Project
- Built as a web-development course final project. `README.md` is the user-facing doc;
  `WRITEUP.md` is the course writeup. Keep both in sync when behavior changes.

---

## Commands — run from `Server/`, not the repo root

`package.json` lives in `Server/`. There is **no root `package.json`**.

```bash
cd Server
npm ci
npm start            # node server.js  → http://localhost:3000
npm test             # 75 tests, Node's built-in runner
npm run lint         # server + browser JavaScript
npm run audit:prod   # npm audit --omit=dev  (currently 0 vulnerabilities)
```

Tests use Node's built-in runner — no Jest, no Mocha, no test dependencies. That is
deliberate; don't introduce a framework without asking.

---

## Repo topology — two remotes (read this before any git work)

| Remote     | URL                                         |
| ---------- | ------------------------------------------- |
| `origin`   | `Dstarinsky/WebDevCourse-Final-Project.git` |
| `advanced` | `Dstarinsky/Advanced_Dev_Course.git`        |

Both track `main` and share history. A bare `git pull` only talks to `origin`, so work
merged on `advanced` reports "Already up to date" while the working copy is stale.
**Always `git fetch --all` and compare both**, and push to both:

```bash
git fetch --all --prune
git log --oneline HEAD..origin/main      # origin has, we don't
git log --oneline HEAD..advanced/main    # advanced has, we don't
git log --oneline origin/main..HEAD      # unpushed
```

`.gitignore` no longer hides Markdown. `Server/.env.example` is tracked (the README
tells users to copy it); the real `.env` is not.

---

## Architecture

```
Server/
├── server.js            # entry: helmet/CSP, sessions, routes, startup sequencing
├── config.js            # THE source of truth for env + policy constants
├── errors.js            # typed errors carrying their HTTP status
├── validation.js        # reusable boundary validators
├── controllers/         # Auth, Favorite, Playlist, Media — thin
├── services/            # AuthService, YouTubeService, UploadService
├── repositories/        # ALL SQL, parameterized and ownership-scoped
├── models/              # User, Playlist, PlaylistSong, Favorite (really used)
├── middleware/          # auth, csrf, rateLimit, upload, errorHandler
├── database/
│   ├── db.js            # connection + init() the server awaits
│   ├── sqlite.js        # promise adapter: get/all/run/exec/transaction
│   └── migrations.js    # versioned, tracked by PRAGMA user_version
├── storage/uploads/     # uploaded audio — OUTSIDE the web root, gitignored
└── views/               # EJS; partials/ holds every shared fragment
client/
├── css/style.css        # token-driven design system
└── js/                  # home.js, playlist.js, favorites.js — ALL page behaviour
```

## Design system — "Sunwashed Broadcast"

`design_plan.md` at the repo root is the visual source of truth. The implementation
follows it; do not introduce visual values that conflict with it.

Light-only 1980s retrofuturism on brutalist structure. The implementation was inverted
from the original dark Outrun plan; never reintroduce a dark theme or theme toggle unless
the product scope explicitly changes. Three rules carry the system:

1. **Saturation is a STATE, not decoration.** The tinted hard-offset signal shadow means
   playing, focused, or just changed. Decorative surfaces use only `--shadow-soft`.
2. **Brutalist bones, selective glass.** The macrostructure is a raw grid with 1px rules.
   Frosted glass is reserved for named shell/workspace layers; rows remain flat and ruled.
3. **Two opposed channels.** Deep magenta `#c6005c` = YouTube + primary action;
   deep teal `#046e7d` = local audio + focus. Never blend them into an identity gradient.

- **Palette:** canvas `#fbf6fa`, surface `#ffffff`, soft surface `#f3eaf4`, text
  `#241733`, muted `#5c4b70`, rule `#e0d2e6`, signal `#c6005c`, playing/focus
  `#046e7d`, and warm amber `#b4520a` / `#ff8a3d`.
- **Type:** Syncopate (display, uppercase, short strings only), Chakra Petch (UI and
  body), Share Tech Mono (labels, indices, readouts). **Syncopate is ~40% wider than a
  normal grotesque** — the `--text-h1` clamp is derived from that width, display lines
  are capped at two words, and a line must never soft-wrap (it breaks the reveal clip).
- **Geometry:** glass panels use an 8px edge; controls use 2px; media uses 4px.
  Signals and primary actions keep clipped/notched corners. Pills remain reserved for
  source/status labels.
- **Exactly two shadows:** `--shadow-soft` for elevated glass and `--shadow-signal`
  for active channel state. Do not invent per-component shadow recipes.
- **Glass:** `--glass-fill`, `--glass-fill-strong`, `--glass-border`, and
  `--glass-blur` are the only recipe. It is used by the masthead, mobile shell,
  dialogs/sheets, compact Library regions, and selected player surfaces—not every row.
- **Every visual value lives in `:root` in `client/css/style.css`.** No hex colours,
  pixel spacing, durations, or easing curves in EJS or JavaScript.
- **Motion:** only `transform` and `opacity` animate. `prefers-reduced-motion` global.
- **Decorative motion is homepage-hero-only** (`design_plan.md` §12.7): the drifting
  CD/cassette field and the typewriter heading. Functional pages stay state-driven.
  The field is `aria-hidden`, `pointer-events: none`, CSS-only (no image assets),
  capped at 0.42 opacity, two objects below 768px, and `display: none` under reduced
  motion. The typewriter animates per-character **opacity, never width** — the full
  text is always in the DOM, so there is no layout shift and the `<h1>` accessible
  name is unchanged.
- **Banned outright:** perspective grid horizon, sunset disc, chrome-gradient type,
  decorative glow, generic card stacks, and any fake waveform / VU meter / spectrum analyser
  (the app has no audio-analysis data and must not imply it).
- Layout classes (`.page-frame`, `.editorial-grid`, `.playlist-workspace`,
  `.track-ledger`) own the macrostructure; Bootstrap utilities handle small
  alignment only. Don't rebuild the layout as long `col-*`/spacing utility strings.

The class vocabulary is deliberately semantic (`.action-primary`, `.track-row`,
`.queue-item`, `.source-label`), not aesthetic — which is why this re-skin was almost
entirely a token and stylesheet change. Keep it that way.

### Shell partials

`layout-head` → `masthead` → page content → `layout-foot` → `mobile-nav`.
**`layout-foot` needs `user` and `active` passed explicitly** — EJS include locals
are scoped to the include that received them, so what you hand `layout-head` is not
visible there. Forgetting this throws `active is not defined` at render time.

Navigation is 80/20: only **Discover** and **Library** are product paths. Account and
sign-out live in a sheet (two clicks, so sign-out is not hit by accident). Below
768px the bottom nav replaces the desktop global nav. The only menu icon is contextual:
it opens the playlist/mix drawer from the Library title strip; it is not global navigation.

### Persistent player boundary

`client/js/playlist.js` owns the live media instance. When the user opens Discover from
an active playlist, it fetches and swaps Discover content into `#discover-spa-container`
instead of unloading the document. Returning through Library—including from the mobile
queue sheet—restores the same workspace, song-row identity, URL `?song=`, and playback
controls. Do not turn those links back into hard navigations: that remounts YouTube/audio
and resets the selected song. The compact player exposes previous, play/pause, and next
controls on both mobile and the Discover view.

**Rules that must not be broken:**

1. **SQL only in `repositories/`.** Always parameterized. The one place identifiers are
   interpolated (`getNextPosition`) resolves them through the `POSITION_SCOPES`
   allowlist — never from caller-supplied strings.
2. **Ownership is enforced in SQL**, not fetched-then-compared: `WHERE id = ? AND
userId = ?`. Route-level `loadOwnedPlaylist` resolves `:id` once and puts the result
   on `req.playlist`. Mutations return `changes > 0` so "matched nothing" becomes a 404.
3. **Controllers stay thin** and are wrapped in `asyncHandler` — no try/catch, no
   `console.error`, no redirect-on-error. Throw a typed error from `errors.js`.
4. **No new config literals.** Anything tunable or duplicated goes in `config.js`;
   `config.publicView` is exposed to templates as `config`.
5. **No inline JavaScript in templates.** The CSP has no `unsafe-inline` for scripts, so
   an inline handler or `<script>` block will silently not run. Pass data via `data-*`
   attributes and handle it in `client/js/`.
6. **Every state-changing route needs `csrfProtection`** and a `_csrf` hidden input (or
   the `X-CSRF-Token` header for `fetch`).

---

## Things that will bite you

- **Never call `db.serialize()`.** The adapter awaits each statement, which already
  guarantees ordering; enabling node-sqlite3's serialized mode _as well_ deadlocks
  `exec()` inside a transaction. This cost real debugging time.
- **EJS escapes `"` as `&#34;`, not `&quot;`**, and `<%= %>` is already sufficient for
  attribute context. Never hand-escape before it — that double-escapes.
- **EJS comments `<%# … %>` cannot contain `<%`**. A `<%=` inside explanatory prose
  breaks template compilation at render time, not at startup.
- **The upload route checks CSRF _after_ multer**, uniquely, because the token travels
  inside the multipart body. Ownership is still checked _before_ multer so no
  unauthorised bytes are ever written. `errorHandler` unlinks `req.file` on any failure.
- **`file-type` is ESM-only** — loaded via cached dynamic `import()` in UploadService.
- **Local songs store the on-disk filename in `videoId`** with `source = 'local'`. That
  filename is never sent to the browser; playback goes through `/media/:songId`.
- **Playback identity is the song row id**, not `videoId` — the same video can appear
  twice in one playlist.
- **Filter and sort are client-side only.** The server-side copies were removed; don't
  reintroduce them without deleting the client ones.

---

## Data model

Schema is created by `database/migrations.js` (current version 2), tracked via
`PRAGMA user_version`, applied in a transaction, and it throws loudly on failure.
Legacy databases are rebuilt into the constrained shape (SQLite cannot `ALTER` a column
into `NOT NULL`/`CHECK`), clamping bad ratings and de-duplicating favorites on the way;
version 2 removes legacy orphan rows before the final foreign-key check.

| Table            | Notable columns                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `users`          | `email` UNIQUE **COLLATE NOCASE**, `passwordHash`, `createdAt`                                                                    |
| `playlists`      | `userId` FK CASCADE, `name`, `position`                                                                                           |
| `playlist_songs` | `playlistId` FK CASCADE, `videoId`, `position`, `source` CHECK(`youtube`\|`local`), `rating` CHECK(0–10), `mimeType`, `sizeBytes` |
| `favorites`      | `userId` FK CASCADE, `videoId`, **UNIQUE(userId, videoId)**                                                                       |

Indexes: `playlists(userId, position)`, `playlist_songs(playlistId, position)`,
`favorites(userId, id DESC)`.

---

## Environment

Copy `Server/.env.example` → `Server/.env`.

`SESSION_SECRET` is **required in production** (≥ 32 chars) — `config.js` throws before
the port binds. `YOUTUBE_API_KEY` is optional; without it search returns `[]`.
`DB_PATH` / `SESSION_DIR` / `UPLOAD_DIR` exist so a persistent disk is a config change,
not a code change.

Tests set these in `tests/helpers.js` **before** requiring the app, and use
`bcryptRounds: 4` for speed.

**Deployment constraint:** `render.yaml` uses one paid Starter instance and a 1 GB
`/var/data` persistent disk for the app database, sessions, uploads, and local backups.
SQLite intentionally stays at one instance. A horizontally scaled deployment requires
managed Postgres, a durable session store, and object storage.

---

## Testing

`Server/tests/` — 75 tests over real HTTP against the imported app (`server.js` only
listens when run directly; `app.ready()` runs migrations first).

- `auth.test.js` — public pages, route protection, register/login/logout, password
  policy, email normalisation, session regeneration, no-hash-in-session, 404 shape
- `ownership.test.js` — IDOR on view/delete/rename/add, reorder rollback, rating and id
  validation, favorite de-duplication
- `upload-security.test.js` — traversal, spoofed mimetype, magic-byte rejection,
  unauthorised upload writes zero files, private media access, file cleanup, size cap
- `hardening.test.js` — CSRF (missing/foreign/valid), headers, CSP has no
  `unsafe-inline`, no inline handlers, escaping round-trip, config fail-fast
- `database.test.js` — adapter failures, transactional rollback, canonical migration
- `maintenance.test.js` — checksummed backup/restore validation
- `rate-limit.test.js` — independent auth/search/upload policies
- `youtube-service.test.js` — validation, caching, upstream failures, invalid JSON, timeout

`helpers.js` provides `configureTestEnv()`, `startServer()`, a cookie-jar `Client` that
handles CSRF automatically, `multipart()`, and `validMp3Bytes()`.
Set `DEBUG_ERRORS=1` to surface server-side errors during a test run.

---

## Accessibility

The vault's mandatory-audit rule is scoped to `Projects/Dev/`; this project sits at
`Projects/WebDevFinalProj`, so it is not strictly covered. It is still a UI project
claiming WCAG-AA. When touching UI, follow `AgenticVault/ACCESSIBILITY.md`, keep the
`aria-*` attributes and the contrast ratios annotated in `client/css/style.css`, and
prefer semantic classes over inline styles.

---

## Conventions

- 4-space indent, semicolons, `async/await`, private class methods (`#name`) where the
  method is genuinely internal.
- Comments explain _why_, especially security decisions. Match that density.
- `docs/` holds the current Draw.io diagrams. Keep each `.drawio` source and its
  companion `.model.xml` synchronized when routes, middleware, services, repositories,
  models, persistence, authentication, or client-navigation behavior changes.
