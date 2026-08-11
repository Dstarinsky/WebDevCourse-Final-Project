const PlaylistRepository = require('../repositories/PlaylistRepository');
const validate = require('../validation');
const { asyncHandler, wantsJson } = require('./errorHandler');
const { NotFoundError } = require('../errors');

/** Reject anonymous requests: JSON for API/fetch callers, a redirect for pages. */
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        if (wantsJson(req)) {
            return res.status(401).json({
                success: false,
                error: { code: 'AUTHENTICATION', message: 'Please log in' }
            });
        }
        return res.redirect('/login');
    }
    next();
}

/** Make the session user available to templates without each handler passing it. */
function exposeUser(req, res, next) {
    res.locals.user = (req.session && req.session.user) || null;
    next();
}

/**
 * Resolve `:id` to a playlist the current user owns, or 404.
 *
 * Mounted *before* Multer on the upload route so an unauthorised upload is refused
 * before any bytes are written to disk. Previously Multer ran first and the
 * ownership check happened afterwards, so posting to someone else's playlist still
 * wrote the file and then merely skipped the database insert, leaving an orphan.
 *
 * 404 rather than 403 so the response does not confirm that a playlist ID exists.
 */
const loadOwnedPlaylist = asyncHandler(async (req, res, next) => {
    const playlistId = validate.positiveId(req.params.id ?? req.body.id, 'Playlist id');
    const playlist = await PlaylistRepository.findOwnedPlaylist(playlistId, req.session.userId);
    if (!playlist) throw new NotFoundError('Playlist not found');
    req.playlist = playlist;
    next();
});

module.exports = { requireAuth, exposeUser, loadOwnedPlaylist };
