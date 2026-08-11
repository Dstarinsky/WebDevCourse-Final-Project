# Code Review 2026-08-11 — Implementation Status

Source review: [`CODE_REVIEW_2026-08-11.txt`](CODE_REVIEW_2026-08-11.txt)

Status: all application-code and repository/deployment-configuration items implemented
and verified locally. The original review remains unchanged as the audit record.

## Release blockers

| Finding                         | Status                               | Implemented evidence                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0.1 durable production data    | Complete in deployment configuration | `render.yaml` uses one paid Starter instance, a 1 GB `/var/data` persistent disk, durable DB/session/upload/backup paths, and `/healthz`; backup/restore is implemented and tested. The Blueprint still has to be synced to Render by an operator. |
| P0.2 vulnerable production tree | Complete                             | `sqlite3` 6.0.1 and reviewed transitive versions are locked; `npm ci` succeeds; `npm audit --omit=dev` reports zero advisories; CI runs the same gates.                                                                                            |

## High-priority security and data boundaries

| Finding                                | Status   | Implemented evidence                                                                                                                                                   |
| -------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1.1 authorize before upload           | Complete | `loadOwnedPlaylist` runs before Multer; temp/final cleanup compensates every failure; multipart limits, upload rate limits, and per-user count/byte quotas are active. |
| P1.2 inspect real file content         | Complete | `file-type` magic-byte detection is authoritative; detected signature must agree with the allowed extension; rejected files are removed and return 415.                |
| P1.3 private media                     | Complete | Uploads live outside `client/`; `/media/:songId` joins through the owning playlist and returns detected MIME, `nosniff`, private caching, and safe inline disposition. |
| P1.4 executable metadata interpolation | Complete | Inline handlers/scripts are removed; escaped `data-*` values and DOM APIs/`textContent` are used; video IDs and thumbnail origins are validated.                       |
| P1.5 fail-closed configuration         | Complete | Production refuses missing, short, or default secrets; current/previous secret arrays support rotation; only safe projected config reaches EJS.                        |
| P1.6 supported runtime                 | Complete | `.node-version`, package engines, Render, and CI target Node 24.18.0 LTS.                                                                                              |

## Security hardening

| Finding                      | Status   | Implemented evidence                                                                                                                                                                                                                                                                                 |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2.1 CSRF                    | Complete | Synchronizer tokens protect every mutation, including POST logout and multipart upload; missing, cross-session, and valid-token cases are tested.                                                                                                                                                    |
| P2.2 session lifecycle       | Complete | Authentication regenerates and saves a new session; sessions store only `{ id, email, firstName }`; logout destroys the session and clears the exact cookie options.                                                                                                                                 |
| P2.3 rate limits and quotas  | Complete | Separate auth, rendered/API search, upload, and write policies are implemented and integration-tested; production proxy trust is explicit.                                                                                                                                                           |
| P2.4 centralized validation  | Complete | Reusable strict validators cover IDs, arrays, ratings, names, email, search, video IDs, URLs, and body sizes. Passwords are 15–128 characters, checked against a local common-password denylist, and SHA-384 pre-hashed before bcrypt so the full value is verified; legacy hashes upgrade on login. |
| P2.5 headers and CSP         | Complete | Helmet supplies the baseline headers and a CSP with no inline script; pinned Bootstrap assets include SHA-384 SRI and anonymous CORS.                                                                                                                                                                |
| P2.6 ownership-scoped writes | Complete | Playlist reads/rename/delete are scoped by user; song mutations always require playlist scope and check row changes.                                                                                                                                                                                 |

## Correctness and reliability

| Finding                        | Status   | Implemented evidence                                                                                                                                                                                       |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3.1–P3.2 favorites            | Complete | Atomic `UNIQUE(userId, videoId)` + `ON CONFLICT DO NOTHING`; rejection and concurrent-duplicate paths are tested; search uses one favorite-ID query.                                                       |
| P3.3 reorder transaction       | Complete | The order must contain the complete unique owned set; every update is awaited in a rollback-capable transaction; malformed, partial, duplicate, foreign, and forced-error paths are tested.                |
| P3.4 startup/migrations        | Complete | Server listening awaits DB initialization; versioned transactional migrations enforce constraints, indexes, cascades, favorite deduplication, and legacy-orphan repair; migration and rollback tests pass. |
| P3.5 file lifecycle            | Complete | Removing songs/playlists deletes private files; an administrative dry-run/delete reconciler reports missing/orphaned files and covers deferred cleanup.                                                    |
| P3.6 MIME correctness          | Complete | Detected MIME and byte size are stored with local songs and used by the private media response.                                                                                                            |
| P3.7 YouTube reliability       | Complete | Query/count validation, `URLSearchParams`, timeouts, status/JSON/shape handling, safe logs, bounded short-lived caching, and distinct empty/failure outcomes are implemented and unit-tested.              |
| P3.8 missing song mutations    | Complete | Repository helpers return `changes`; absent rows return 404 instead of false success.                                                                                                                      |
| P3.9 playback identity         | Complete | Queue identity and deep links use `playlist_songs.id`; duplicate videos are individually addressable and foreign song IDs are rejected.                                                                    |
| P3.10–P3.12 view serialization | Complete | URL APIs/static client modules replace script interpolation; EJS escapes titles exactly once; the nonexistent local thumbnail is normalized to `NULL`.                                                     |
| P3.13 HTTP outcomes            | Complete | Async routing, typed errors, centralized HTML/JSON handling, actionable fetch failures, and real web/API 404s are implemented.                                                                             |
| P3.14 legacy redirect          | Complete | The obsolete `.html` redirect middleware was removed.                                                                                                                                                      |

## DRY, KISS, and housekeeping

| Area                              | Status   | Implemented evidence                                                                                                                                                                                                                            |
| --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P4 view ownership                 | Complete | Shared layout, masthead/mobile navigation, auth statement/error, create-playlist, playlist-links, queue-item, and search-result partials own stable markup; browser behavior lives in static modules.                                           |
| P4 filtering/config/data adapters | Complete | Filtering/sorting is client-side only; environment config and fixed domain policies have separate owners; dotenv/upload setup are single-owner; SQLite promises and row metadata use one adapter.                                               |
| P5 models/dead code               | Complete | The four models are retained and consistently constructed; dead `findById`/`isOwnedBy`, broken asset, runtime trigger, duplicate info file, unsafe optional mutations, and obsolete upload path were removed.                                   |
| P5 repository/docs/deployment     | Complete | Sanitized `.env.example` and Markdown are trackable; naming is Music Hub throughout; README/writeup/current architecture diagrams describe the hardened system; Render uses reproducible `npm ci` and documents its single-instance constraint. |

## Subsequent UI and documentation reconciliation

After the hardening work, the product UI moved to the light-only Sunwashed Broadcast
system and the documentation set was reconciled with the delivered behavior:

- The Library now uses a compact bounded desktop workspace, independent panel
  scrolling, a full-width mix-title strip, and a smaller player.
- The mini/footer player keeps previous, play/pause, and next controls available on
  Discover and mobile layouts.
- Moving between Library and Discover inside the mounted playlist workspace preserves
  the active media element, queue identity, current time, and playback state.
- The masthead uses the custom `MUSIC` signal-line and notched `HUB` wordmark.
- All editable Draw.io sources and companion model XML files now describe the current
  controllers, services, repositories, migration-v2 schema, private media path, and
  playback boundary.

## Hardening verification record

- Clean install: `npm ci` — passed, zero install-time vulnerabilities.
- Production runtime: Node 24.18.0.
- Tests: 75 passed, 0 failed.
- Lint: `npm run lint` — passed with zero warnings.
- Formatting: `npm run format:check` — passed.
- Production audit: `npm audit --omit=dev` — 0 total advisories.
- Patch hygiene: `git diff --check` — passed.

## Operational handoff

Code cannot attach or pay for a live Render disk by itself. Sync the updated Blueprint,
confirm `/var/data` is mounted, run `npm run backup`, copy that backup off the Render
disk, and perform a restore drill before treating the live service as durable. The
single-instance SQLite design is intentional; horizontal scaling requires the managed
Postgres/object-storage design described in the original review.
