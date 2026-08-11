# Music Hub — Historical Code Review & Change Suggestions

**Reviewed:** 2026-08-11 · commit `7c964ac` · all 15 tests passing
**Scope:** full `Server/` + `client/` tree, DRY / KISS / hardcoded-value focus
**Archive status:** this is the earlier 15-test review snapshot. Its findings have since
been implemented and superseded by the broader senior audit and the current
[`CODE_REVIEW_IMPLEMENTATION_STATUS_2026-08-11.md`](CODE_REVIEW_IMPLEMENTATION_STATUS_2026-08-11.md).
Paths, line numbers, dark-theme examples, and proposed code below intentionally describe
the reviewed commit, not the current tree.

---

## Verdict

The architecture is genuinely good. Layering is clean and consistently obeyed, SQL is confined
to repositories and fully parameterized, ownership checks are systematic, and the upload
pipeline is properly hardened. That is better than most course projects and better than a lot
of production code.

The problems are concentrated in three places:

1. **Two confirmed bugs** — one data-corruption, one request-hang. Both small fixes.
2. **The view layer** — this is where DRY breaks down badly. Six templates each repeat the
   full page shell, and two chunks of DOM exist twice in two different languages.
3. **Magic values scattered across seven files** with no config module, including one number
   (`6`) duplicated across a layer boundary where it can silently drift.

Findings are ordered by priority. Severity reflects real-world impact, not theoretical purity.

---

# Priority 1 — Correctness & security

### 1.1 `data-title` is double-escaped, corrupting any title containing a quote — **CONFIRMED BUG**

`Server/views/playlists/view.ejs:165`

```ejs
data-title="<%= song.title.replace(/"/g, '&quot;') %>"
```

EJS `<%= %>` already HTML-escapes `& < > " '`. The manual `.replace()` runs *first*, so the
string is escaped twice:

| Step | Value |
|------|-------|
| Original title | `Say "Hello"` |
| After `.replace()` | `Say &quot;Hello&quot;` |
| After EJS escaping `&` → `&amp;` | `Say &amp;quot;Hello&amp;quot;` |
| Browser decodes attribute → `dataset.title` | `Say &quot;Hello&quot;` ← **wrong** |

Every consumer of `dataset.title` gets the corrupted string: the player heading rendered by
`mountLocal()`, the queue filter's substring match, and the `aria-label` on rebuilt rows.

**Fix — delete the `.replace()`:**

```ejs
data-title="<%= song.title %>"
```

EJS escaping alone is correct and sufficient for attribute context.

---

### 1.2 `FavoriteRepository.add()` can hang the request forever — **CONFIRMED BUG**

`Server/repositories/FavoriteRepository.js:6-19`

```js
add(userId, videoId, title, thumbnailUrl) {
    return new Promise((resolve, reject) => {
        this.checkIsFavorite(userId, videoId).then(exists => {
            ...
        });                              // ← no .catch(reject)
    });
}
```

If `checkIsFavorite` rejects (locked DB, I/O error), the outer promise **never settles**. The
`await` in `FavoriteController.add` hangs, no response is ever sent, and the browser spins
until timeout. The `try/catch` in the controller cannot help — nothing throws.

**Fix — `async` + `await` removes the manual promise entirely:**

```js
async add(userId, videoId, title, thumbnailUrl) {
    if (await this.checkIsFavorite(userId, videoId)) return null;   // already saved
    return new Promise((resolve, reject) => {
        const sql = `INSERT INTO favorites (userId, videoId, title, thumbnailUrl, createdAt)
                     VALUES (?, ?, ?, ?, ?)`;
        db.run(sql, [userId, videoId, title, thumbnailUrl, new Date().toISOString()],
            function (err) { err ? reject(err) : resolve(this.lastID); });
    });
}
```

> Same class of omission, lower impact: `PlaylistRepository.reorderPlaylists` ignores errors
> from `BEGIN TRANSACTION` and from each `stmt.run`. Only `COMMIT` is checked, so a failed
> row update resolves as success.

---

### 1.3 The bcrypt hash is stored in the session and exposed to every view — **HIGH**

`Server/controllers/AuthController.js:39-40`

```js
req.session.userId = user.id;
req.session.user = user;        // full User instance — includes passwordHash
```

The complete `User` object, `passwordHash` included, is serialized as JSON into
`sessions.sqlite`, and `requireAuth` then publishes it as `res.locals.user` — reachable from
every template as `user.passwordHash`. One careless `<%= JSON.stringify(user) %>` during
debugging leaks every hash it touches.

**Fix — store only what the views actually use** (`firstName` is the only field read today):

```js
req.session.user = { id: user.id, email: user.email, firstName: user.firstName };
```

No template change needed. Worth adding a test asserting `passwordHash` never appears in a
rendered response.

---

### 1.4 `/logout` mutates state over GET — **LOW**

`Server/server.js:113`

Any `<img src="https://your-app/logout">` on a third-party page silently logs the user out.
`sameSite: 'lax'` does not help — it permits top-level GET. Nuisance-grade CSRF, but free to fix.

**Fix:** make it `app.post('/logout', …)` and convert the navbar link to a small POST form
(or `fetch` + redirect). Update `auth.test.js:logout clears the session` accordingly.

---

### 1.5 Emails are case-sensitive and never validated — **MEDIUM**

`Server/services/AuthService.js:10-14`

`David@x.com` and `david@x.com` register as two separate accounts, and the uniqueness check
misses. There is also no format validation at all — `"hello"` is an acceptable email.

**Fix:**

```js
const email = (dto.email || '').trim().toLowerCase();
if (!EMAIL_PATTERN.test(email)) throw new Error('Please enter a valid email address');
```

Existing rows keep their original casing — either accept that or add a one-time
`UPDATE users SET email = LOWER(email)`. Note the login form labels the field
"Username / Email" while the code treats it strictly as an email; pick one.

---

### 1.6 No rate limiting on `/login` or `/register` — **MEDIUM**

Unlimited password guesses at full server speed. `express-rate-limit` is one dependency and
about five lines, scoped to the two auth routes.

---

### 1.7 Deleted songs leave orphaned MP3s on disk forever — **LOW**

`PlaylistController.removeSong` / `deletePlaylist` remove the DB rows; the uploaded file in
`client/uploads/` is never touched. Storage grows monotonically.

**Fix:** on removal, if `source === 'local'`, `fs.unlink` the file. Resolve the path with
`path.join(UPLOAD_DIR, path.basename(videoId))` and confirm it stays inside `UPLOAD_DIR`
before unlinking — never trust the stored value as a path.

---

### 1.8 `getNextPosition` interpolates identifiers into SQL — **LOW (latent)**

`Server/repositories/PlaylistRepository.js:8-15`

```js
db.get(`SELECT MAX(position) as maxPos FROM ${table} WHERE ${column} = ?`, [value], …)
```

Both call sites pass hardcoded literals, so this is **not currently exploitable**. It is a
loaded footgun for the next person who passes a variable.

**Fix — allowlist the identifiers:**

```js
const POSITION_SCOPES = {
    playlists:      'userId',
    playlist_songs: 'playlistId'
};

getNextPosition(table, value) {
    const column = POSITION_SCOPES[table];
    if (!column) throw new Error(`Unknown position scope: ${table}`);
    ...
}
```

This also simplifies both call sites to `getNextPosition('playlists', userId)`.

---

### 1.9 Fragile escaping in `onclick` attributes — **LOW**

`Server/views/favorites.ejs:59,107`

```ejs
onclick="openAddModal('<%= video.videoId %>', '<%= video.title.replace(/'/g, "\\'") %>', …)"
```

Hand-rolled JS-string escaping inside an HTML attribute. It survives the common cases, but a
title ending in a backslash escapes the closing quote and shifts the parse. The DRY fix in
§2.4 removes the pattern entirely.

---

# Priority 2 — DRY

### 2.1 The page shell is copy-pasted into all six views — **biggest single win**

Every view repeats the same 8 opening lines and the same closing block. The Bootstrap CDN
`<script>` tag appears **7 times** across the templates; the version string `5.3.0` is written
out 7 times. Upgrading Bootstrap today means seven coordinated edits.

**Fix — two partials:**

`views/partials/layout-head.ejs`
```ejs
<%# Locals: title, user, active, bodyClass (optional) %>
<!DOCTYPE html>
<html lang="en" data-bs-theme="dark">
<head>
    <%- include('head', { title }) %>
</head>
<body class="<%= typeof bodyClass !== 'undefined' ? bodyClass : '' %>">
    <%- include('navbar', { user, active }) %>
```

`views/partials/layout-foot.ejs`
```ejs
    <script src="<%= cdn.bootstrapJs %>"></script>
</body>
</html>
```

Each view collapses to its actual content:

```ejs
<%- include('partials/layout-head', {
        title: 'Login', user: null, active: 'home',
        bodyClass: 'd-flex flex-column min-vh-100' }) %>

<main class="flex-grow-1 …"> … </main>

<%- include('partials/layout-foot') %>
```

`view.ejs` needs one extra script tag; give `layout-foot` an optional `extraScripts` local.
This also fixes a real inconsistency: `index.ejs:6` uses a bare `<body>` while `login.ejs`
and `register.ejs` use `d-flex flex-column min-vh-100`.

---

### 2.2 The queue row exists twice, in two languages — **highest drift risk**

- Server: `views/playlists/view.ejs:163-195` (EJS)
- Client: same file, `appendSong()` at `:428-452` (JS string concatenation)

Two hand-maintained representations of identical DOM. They have **already drifted** — the
server row renders `class="… queue-item border-0 rounded p-2"` while `appendSong` adds
`bg-transparent`, and the server version handles `source === 'local'` (mic icon) while the
JS version always emits an `<img>`.

The same duplication exists for search results: EJS at `:117-128` vs `renderResults()` at
`:388-399`.

**Recommended fix — one `<template>`, cloned by JS:**

```html
<template id="queueItemTemplate">
  <div class="list-group-item queue-item border-0 rounded p-2"> … </div>
</template>
```

`appendSong` clones it and fills in `textContent` / `dataset` / `src`. This kills the string
concatenation, removes the need for the hand-rolled `esc()` helper (`textContent` cannot
inject markup), and leaves exactly one copy of the markup.

**Alternative:** have `POST /playlists/:id/add` return rendered HTML via
`res.render('partials/queue-item', …, cb)` and `insertAdjacentHTML` it. Fewer moving parts,
one network round-trip already in flight, and the row is rendered by the same EJS partial the
initial page uses — truly one source of truth.

---

### 2.3 The playlist sidebar list is duplicated in the same file

`view.ejs:20-27` (desktop sidebar) and `:236-241` (mobile offcanvas drawer) render the same
list with identical markup. Extract `views/partials/playlist-links.ejs` taking
`{ playlists, currentId }` and include it twice.

Likewise, the **"New Playlist" modal** is byte-identical in `playlists/index.ejs:36-51` and
`playlists/view.ejs:205-213` → `views/partials/create-playlist-modal.ejs`.

---

### 2.4 Inline `onclick` handlers duplicate call sites

`favorites.ejs` wires `openAddModal(...)` and `openPlayModal(...)` through inline `onclick`
attributes at four sites, each re-escaping its arguments by hand.

**Fix — data attributes plus one delegated listener**, matching the pattern `view.ejs` already
uses successfully:

```html
<button class="js-add-to-playlist"
        data-video-id="<%= video.videoId %>"
        data-title="<%= video.title %>"
        data-thumb="<%= video.thumbnail %>">Playlist</button>
```

```js
document.addEventListener('click', e => {
    const btn = e.target.closest('.js-add-to-playlist');
    if (btn) openAddModal(btn.dataset);
});
```

No manual escaping anywhere, and it resolves §1.9. It also makes the two files stylistically
consistent — right now `favorites.ejs` uses inline handlers while `view.ejs` uses delegation.

---

### 2.5 `login.ejs` and `register.ejs` are ~90% identical

Same card, same heading block, same error alert, same footer link, same submit button —
differing only in fields and copy. After §2.1 they shrink a lot; if you want to go further,
extract `partials/auth-card.ejs` taking `{ heading, subtitle, action, submitLabel, error }`
and pass the fields as the include body.

At minimum, extract the repeated error alert:

```ejs
<%- include('partials/form-error', { error }) %>
```

---

### 2.6 The controller try/catch boilerplate repeats 12 times

`PlaylistController` repeats this shape in nearly every method:

```js
try { … } catch (e) { console.error(e); res.redirect('/playlists'); }
```

and the JSON/redirect dual-response block appears four times verbatim:

```js
if (wantsJson(req)) return res.status(500).json({ success: false });
res.redirect(`/playlists/${req.params.id}`);
```

**Fix — two small helpers:**

```js
// Wraps a handler so any throw lands in one place instead of 12.
const handle = (fn, fallback) => async (req, res) => {
    try { await fn(req, res); }
    catch (err) {
        console.error(err);
        if (wantsJson(req)) return res.status(500).json({ success: false });
        res.redirect(typeof fallback === 'function' ? fallback(req) : fallback);
    }
};
```

Then: `app.post('/playlists/create', requireAuth, handle(PlaylistController.create, '/playlists'))`.

This is a judgment call — it trades explicitness for concision. If you prefer the current
explicit style for a course project, that is a legitimate choice; the duplication is at least
uniform and correct today.

---

### 2.7 `dotenv` is loaded three times

`server.js:1`, `FavoriteController.js:4`, `PlaylistController.js:4`.

`server.js` is the entry point and runs first; the controller calls are dead weight (harmless
but misleading — they suggest the controllers are independently runnable). **Delete both
controller calls.** Tests set env vars in `helpers.js` before requiring the app, so nothing
depends on the redundant loads.

---

# Priority 3 — Hardcoded values → config

There is currently no config module; `constants.js` holds only `RATING_MIN` / `RATING_MAX`.
Everything below is a literal embedded in code.

### 3.1 The one that will actually bite you: password length is duplicated

| Location | Value |
|----------|-------|
| `services/AuthService.js:14` | `dto.password.length < 6` |
| `views/register.ejs:41` | `minlength="6"` |

Two independent `6`s across a layer boundary. Change one, and the client and server disagree —
either the browser blocks a valid password or the server rejects one the browser accepted.

### 3.2 Full inventory

| Value | Location | Notes |
|-------|----------|-------|
| `6` (min password) | `AuthService.js:14`, `register.ejs:41` | duplicated — see above |
| `10` (bcrypt cost) | `AuthService.js:29` | should be tunable per environment |
| `1000*60*60*24` (session TTL) | `server.js:87` | |
| `'dev-only-insecure-secret-change-me'` | `server.js:83` | see §3.4 |
| `25 * 1024 * 1024` (upload cap) | `server.js:20` | |
| `ALLOWED_AUDIO_EXT` set | `server.js:19` | belongs in `constants.js` |
| `5`, `8`, `6`, `5` (search result counts) | `YouTubeService.js:5`, `FavoriteController.js:25`, `PlaylistController.js:114,64` | four different values, no rationale |
| `'https://www.googleapis.com/youtube/v3/search'` | `YouTubeService.js:1` | fine as a module constant |
| `'https://www.youtube.com/embed/'` | `favorites.ejs:206`, `view.ejs:70` | duplicated |
| Bootstrap `5.3.0` CDN | 7 template locations | see §2.1 |
| Bootstrap Icons `1.10.0`, Google Fonts URL | `head.ejs:8-9` | |
| `'MyMusicApp'` brand | `navbar.ejs:4` + 4 page titles | conflicts with "Music Hub" in README |
| GitHub / LinkedIn URLs | `index.ejs:41,47` | |
| `'sessions.sqlite'`, `'music_app.sqlite'` | `server.js:80`, `db.js:14` | env-overridable already |
| `NODE_VERSION 20.0.0`, `region: oregon` | `render.yaml` | conflicts with `engines: >=18.0.0` |

### 3.3 `/images/mp3-icon.png` points at a file that does not exist — **verified**

`PlaylistController.js:162` stores `'/images/mp3-icon.png'` as the thumbnail for every local
upload. `client/` contains only `css/` and `uploads/` — there is no `images/` directory.

It never 404s in practice only because `view.ejs:170` branches on `source === 'local'` and
renders a `<i class="bi bi-mic-fill">` icon instead of the `<img>`. So the value is dead — but
it is a trap for anyone who later renders a local song's thumbnail generically. Either ship the
asset or store `null` and let the view own the fallback.

### 3.4 Proposed `Server/config.js`

Single module, env-overridable, validated once at boot:

```js
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const isTest       = process.env.NODE_ENV === 'test';

// Fail fast in production rather than silently signing sessions with a known secret.
const sessionSecret = process.env.SESSION_SECRET
    || (isProduction ? null : 'dev-only-insecure-secret-change-me');
if (!sessionSecret) throw new Error('SESSION_SECRET must be set in production');

module.exports = {
    isProduction,
    isTest,
    port: Number(process.env.PORT) || 3000,

    auth: {
        minPasswordLength: 6,
        bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
        sessionMaxAgeMs: 1000 * 60 * 60 * 24,
        sessionSecret
    },

    rating: { min: 0, max: 10 },

    uploads: {
        dir: process.env.UPLOAD_DIR || path.join(__dirname, '../client/uploads'),
        maxBytes: 25 * 1024 * 1024,
        allowedExtensions: new Set(['.mp3', '.m4a', '.ogg', '.oga', '.wav', '.flac', '.aac'])
    },

    youtube: {
        apiKey: process.env.YOUTUBE_API_KEY || '',
        searchUrl: 'https://www.googleapis.com/youtube/v3/search',
        embedUrl: 'https://www.youtube.com/embed/',
        defaultResults: 6
    },

    branding: {
        appName: 'Music Hub',
        github: 'https://github.com/Dstarinsky',
        linkedin: 'https://www.linkedin.com/in/david-starinsky/'
    },

    cdn: {
        bootstrapCss: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
        bootstrapJs:  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
        bootstrapIcons: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css'
    }
};
```

Absorb `constants.js` into this (keep `RATING_MIN`/`RATING_MAX` re-exported if you prefer not
to touch the three existing import sites).

**Expose it to every template once**, so views stop hardcoding CDN URLs and brand strings:

```js
app.locals.config = require('./config');
```

Then `head.ejs` becomes `<link href="<%= config.cdn.bootstrapCss %>" rel="stylesheet">`, and
`register.ejs` becomes `minlength="<%= config.auth.minPasswordLength %>"` — closing the §3.1
drift permanently.

The `SESSION_SECRET` fail-fast is the highest-value line here: today a production deploy that
forgets the variable boots happily and signs every session with a secret published in your
public repo.

---

# Priority 4 — KISS / simplification

### 4.1 Three of the four models are dead code — **verified**

`grep` across `Server/` (excluding `node_modules`) finds imports of `models/User` only, from
`UserRepository` and `AuthService`. **`Playlist.js`, `PlaylistSong.js`, and `Favorite.js` are
never imported by anything.** The repositories return raw SQLite rows.

Two honest options — pick one, do not leave it ambiguous:

- **Delete them.** They document intent that the code does not follow. `FILE-TREE.md` and
  `WRITEUP.md` both advertise a complete MVC model layer, so update those too.
- **Use them.** Have repositories return real instances, as `UserRepository` already does.
  More consistent, slightly more code, and `Playlist.songs` finally gets populated.

Given this is a course project graded on MVC, the second may serve you better — but the
current halfway state is the worst of both.

### 4.2 Filter and sort are implemented twice, and the server copy is dead

`PlaylistController.show:52-58` filters and sorts server-side from `?filter=` / `?sort=`.
`view.ejs:460-480` filters and sorts the same list client-side.

Since the queue is driven entirely by AJAX and never reloads, **the server-side path almost
never runs** — the query params are only honored on a hard navigation. Two implementations of
one behavior, in two languages, and the one you are maintaining is the one that does not run.

**Recommendation:** delete the server-side filter/sort and the `sort`/`filter` hidden inputs
that thread them through forms. Keep `sortBy` / `filterQuery` only if you want deep-linkable
state — and if you do, delete the *client* implementation instead. Do not keep both.

The same applies to `prevLink` / `nextLink` (`view.ejs:47-55`): computed in an EJS scriptlet as
a no-JS fallback, then immediately overridden by `updateTransport()`. Reasonable as progressive
enhancement — but that intent should be a comment, not an inference.

### 4.3 `getUserPlaylists` copies rows for no reason

`PlaylistRepository.js:38` — `resolve(rows.map(r => ({...r})))`. The spread produces an
identical object. Either `resolve(rows)` or, per §4.1, map to real `Playlist` instances.

### 4.4 `AuthController` passes a promise where a thunk is clearer

`AuthController.js:26,35` call `AuthService.register(dto)` *at the call site* and pass the
pending promise into `authenticate()`. It works, but the rejection is briefly unobserved and
the reader has to check that `authenticate` awaits it immediately. Passing `() => AuthService.register(dto)`
and calling it inside the `try` is more obviously safe.

### 4.5 `AuthService.register` mutates its argument

`AuthService.js:16-17` writes `dto.email` / `dto.firstName` back onto the caller's object.
Build a clean object instead — the trimmed values are already in local variables. Also,
`lastName` is never trimmed while `firstName` and `email` are.

### 4.6 `YouTubeService` swallows all API failures

A 403 (quota exceeded — likely on a free key) returns no `items`, so `search()` returns `[]`
and the UI reports "No results" — indistinguishable from a genuinely empty search. Add:

```js
if (!response.ok) {
    console.error(`YouTube API ${response.status}:`, await response.text());
    return [];
}
```

Consider `AbortSignal.timeout(5000)` too — an unresponsive API currently hangs the request.

### 4.7 Inline styles bypass the design system

`view.ejs` carries 19 inline `style="…"` attributes, several hardcoding
`rgba(255,255,255,0.1)` while `style.css` defines `--border-subtle` as exactly that value.
`favorites.ejs` has 6 more. The token system exists and is well built — these should be
utility classes (`.queue-scroll`, `.thumb-sm` already show the pattern).

---

# Priority 5 — Housekeeping

- **`Server/tmp/restart.txt`** — leftover nodemon trigger. Delete `Server/tmp/`.
- **`Archive.zip` (132 MB)** and **`Screen Recording Final Project.mov` (31 MB)** sit in the
  working tree. Gitignored, so the repo is safe, but they dominate the folder. Move them out.
- **`.DS_Store`** files at root, `client/`, and `Server/`. Gitignored; delete locally.
- **`docs/` diagrams** describe the pre-refactor architecture. `YouTubeService` and
  `constants.js` are new; the class diagram will not match. Update or note them as historical.
- **No security headers.** `helmet` is one line of middleware. Note that the default CSP will
  block the CDN scripts and the YouTube iframe, so it needs configuring — worth doing, but not
  a drop-in.
- **`engines` mismatch.** `package.json` says `>=18.0.0`, `render.yaml` pins `20.0.0`. Harmless
  but confusing; align them.

---

# Suggested order of work

Grouped so each stage is independently shippable and testable.

| Stage | Items | Why first |
|-------|-------|-----------|
| **1. Bugs** | §1.1, §1.2, §1.3 | Two confirmed defects and a credential-exposure path. Small, isolated, high value. |
| **2. Config** | §3.4, §3.1, §2.7, §3.3 | Introduce `config.js`, wire `app.locals.config`, retire the duplicated `6`. Unblocks stage 3. |
| **3. View DRY** | §2.1, §2.3, §2.5 | Layout partials. Largest line reduction; touches every template, so do it in one pass. |
| **4. Markup duplication** | §2.2, §2.4 | The `<template>` refactor. Most delicate — do it alone, with the player exercised manually. |
| **5. Simplification** | §4.1, §4.2, §4.3, §4.6 | Decide the models question, then delete one of the two filter/sort implementations. |
| **6. Hardening** | §1.4, §1.5, §1.6, §1.7 | Logout verb, email normalization, rate limiting, orphan cleanup. Each needs a test. |
| **7. Housekeeping** | Priority 5 | Cosmetic. |

**Test coverage to add alongside:** the existing 15 tests do not cover favorites at all, nor
rating clamping, nor the session-payload shape from §1.3. Stages 1 and 6 should each land with
a test that fails before the fix.

---

## What I would leave alone

Worth stating explicitly, since "review" tends to imply "change everything":

- **The layering.** Controllers → services → repositories is clean and consistently honored.
- **The parameterized SQL.** Genuinely correct throughout; §1.8 is the sole rough edge and is
  not exploitable.
- **The ownership model.** `getOwnedPlaylist` plus `playlistId`-scoped mutations is the right
  design, and it is tested.
- **The upload pipeline.** Server-generated filenames, extension allowlist, mimetype check,
  size cap. This is textbook-correct and well commented.
- **The zero-dependency test suite.** Fast, readable, real HTTP, no framework. Keep it.
- **The CSS design system.** Tokenized, with contrast ratios annotated inline. The problem is
  templates bypassing it (§4.7), not the system itself.
