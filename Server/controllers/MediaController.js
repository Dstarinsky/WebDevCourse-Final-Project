const fs = require('fs');
const PlaylistRepository = require('../repositories/PlaylistRepository');
const UploadService = require('../services/UploadService');
const validate = require('../validation');
const { NotFoundError } = require('../errors');

class MediaController {
    /**
     * GET /media/:songId — stream a user's own uploaded audio.
     *
     * Uploads used to sit under the express.static root, so the audio URL was
     * reachable by anyone who learned the filename: playlist ownership protected the
     * page but not the file. Random filenames are obscurity, not authorization. The
     * ownership join here is the actual control, and the files now live outside the
     * web root entirely.
     */
    async stream(req, res) {
        const songId = validate.positiveId(req.params.songId, 'Song id');
        const song = await PlaylistRepository.findSongForUser(songId, req.session.userId);
        if (!song || !song.isLocal) throw new NotFoundError('Track not found');

        const filePath = UploadService.resolveStoredPath(song.videoId);
        let stats;
        try {
            stats = await UploadService.statStored(song.videoId);
        } catch {
            throw new NotFoundError('Track not found');
        }

        // Serve the type detected from the file's own bytes at upload time, not a
        // hardcoded audio/mpeg — the allowlist covers seven formats.
        res.set({
            'Content-Type': song.mimeType || 'application/octet-stream',
            'Content-Length': stats.size,
            'Accept-Ranges': 'bytes',
            // Never let a browser re-interpret this as something executable.
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'inline',
            // Private media must not be cached by shared proxies.
            'Cache-Control': 'private, max-age=0, no-store'
        });

        const range = req.headers.range;
        if (range) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range);
            if (match) {
                const start = match[1] ? Number.parseInt(match[1], 10) : 0;
                const end = match[2] ? Number.parseInt(match[2], 10) : stats.size - 1;
                if (
                    Number.isNaN(start) ||
                    Number.isNaN(end) ||
                    start > end ||
                    start >= stats.size
                ) {
                    return res.status(416).set('Content-Range', `bytes */${stats.size}`).end();
                }
                res.status(206).set({
                    'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                    'Content-Length': end - start + 1
                });
                return fs.createReadStream(filePath, { start, end }).pipe(res);
            }
        }

        fs.createReadStream(filePath).pipe(res);
    }
}

module.exports = new MediaController();
