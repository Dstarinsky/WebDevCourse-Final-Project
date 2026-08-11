# Music Hub - File Tree (code files)

All project source-code files (`.js`, `.ejs`, `.css`). Non-code files
(`.md`, `.xml`, `.drawio`, `.json`, `.yaml`, `.env`, etc.) are omitted.
The full MVC is included: every Model, View, and Controller.

```
WebDevFinalProj/
├── client/                                   # static assets only (no user data)
│   ├── css/
│   │   └── style.css                         # View: design system / styling
│   └── js/                                   # View: all page behaviour (no inline JS)
│       ├── home.js                           # accessible typewriter enhancement
│       ├── playlist.js                       # persistent player, queue, AJAX, SPA navigation
│       └── favorites.js                      # add-to-playlist + preview modals
└── Server/
    ├── server.js                             # app entry: routes, middleware, startup
    ├── config.js                             # validated environment configuration
    ├── policies.js                           # fixed domain limits and allowlists
    ├── errors.js                             # typed errors with HTTP status
    ├── validation.js                         # reusable input validators
    ├── controllers/                          # Controller
    │   ├── AuthController.js
    │   ├── FavoriteController.js
    │   ├── PlaylistController.js
    │   └── MediaController.js                # authenticated audio streaming
    ├── services/
    │   ├── AuthService.js                    # validation, bcrypt, session lifecycle
    │   ├── YouTubeService.js                 # search + upstream failure handling
    │   └── UploadService.js                  # magic-byte validation, quotas, storage
    ├── repositories/                         # all SQL (parameterized, ownership-scoped)
    │   ├── UserRepository.js
    │   ├── PlaylistRepository.js
    │   └── FavoriteRepository.js
    ├── models/                               # Model
    │   ├── User.js
    │   ├── Playlist.js
    │   ├── PlaylistSong.js
    │   └── Favorite.js
    ├── middleware/
    │   ├── auth.js                           # requireAuth, exposeUser, loadOwnedPlaylist
    │   ├── csrf.js                           # synchronizer tokens
    │   ├── rateLimit.js                      # auth / search / upload / write limiters
    │   ├── upload.js                         # multer intake
    │   └── errorHandler.js                   # asyncHandler + central error middleware
    ├── database/
    │   ├── db.js                             # connection + init()
    │   ├── sqlite.js                         # promise adapter
    │   └── migrations.js                     # versioned schema
    ├── maintenance/
    │   └── backup.js                         # checksummed backup + recoverable restore
    ├── security/
    │   └── passwords.js                      # local common-password denylist
    ├── scripts/
    │   ├── backup-data.js
    │   ├── restore-data.js
    │   ├── reconcile-uploads.js
    │   └── lint.js
    ├── views/                                # View (EJS)
    │   ├── index.ejs
    │   ├── login.ejs
    │   ├── register.ejs
    │   ├── favorites.ejs
    │   ├── error.ejs
    │   ├── playlists/
    │   │   ├── index.ejs
    │   │   └── view.ejs
    │   └── partials/
    │       ├── layout-head.ejs               # shared page shell (open)
    │       ├── layout-foot.ejs               # shared page shell (close)
    │       ├── masthead.ejs
    │       ├── mobile-nav.ejs
    │       ├── auth-statement.ejs
    │       ├── form-error.ejs
    │       ├── playlist-links.ejs
    │       ├── create-playlist-modal.ejs
    │       ├── queue-item.ejs                # one source of truth (server + template)
    │       └── search-result.ejs             # one source of truth (server + template)
    └── tests/
        ├── helpers.js
        ├── auth.test.js
        ├── ownership.test.js
        ├── upload-security.test.js
        ├── hardening.test.js
        ├── database.test.js
        ├── maintenance.test.js
        ├── rate-limit.test.js
        └── youtube-service.test.js
```
