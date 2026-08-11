const config = require('../config');
const path = require('path');
const PlaylistRepository = require('../repositories/PlaylistRepository');
const YouTubeService = require('../services/YouTubeService');
const { YouTubeUnavailableError } = require('../services/YouTubeService');
const UploadService = require('../services/UploadService');
const PlaylistSong = require('../models/PlaylistSong');
const validate = require('../validation');
const { wantsJson } = require('../middleware/errorHandler');
const { NotFoundError, ValidationError } = require('../errors');

class PlaylistController {
    /** GET /playlists — jump straight to the first playlist, or show the empty state. */
    async index(req, res) {
        const playlists = await PlaylistRepository.getUserPlaylists(req.session.userId);
        if (playlists.length > 0) return res.redirect(`/playlists/${playlists[0].id}`);
        res.render('playlists/index', {
            title: `My Library — ${config.branding.appName}`,
            user: req.session.user,
            playlists: []
        });
    }

    /**
     * GET /playlists/:id — `req.playlist` is already ownership-checked by middleware.
     *
     * Filtering and sorting are deliberately client-side only (the queue is driven by
     * fetch and never reloads, so the old server-side copy almost never ran). Playback
     * identity is the song row id, not the videoId: the same video can appear twice in
     * a playlist and each row must be individually addressable.
     */
    async show(req, res) {
        const { playlist } = req;
        const [songs, allPlaylists] = await Promise.all([
            PlaylistRepository.getSongsByPlaylistId(playlist.id),
            PlaylistRepository.getUserPlaylists(req.session.userId)
        ]);

        const requestedId = req.query.song ? validate.positiveId(req.query.song, 'Song id') : null;
        const requestedSong = requestedId ? songs.find((song) => song.id === requestedId) : null;
        if (requestedId && !requestedSong) {
            throw new NotFoundError('Song not found in this playlist');
        }
        const currentSong = requestedSong || songs[0] || null;

        const searchQuery = validate.searchQuery(req.query.search);
        let searchResults = [];
        let searchError = null;
        if (searchQuery) {
            try {
                searchResults = await YouTubeService.search(searchQuery);
            } catch (err) {
                if (!(err instanceof YouTubeUnavailableError)) throw err;
                searchError = err.message;
            }
        }

        res.render('playlists/view', {
            title: `${playlist.name} — ${config.branding.appName}`,
            user: req.session.user,
            playlist,
            songs,
            playlists: allPlaylists,
            searchResults,
            searchQuery,
            searchError,
            currentSong
        });
    }

    async create(req, res) {
        const name = validate.requiredString(
            req.body.name,
            'Playlist name',
            config.playlists.maxNameLength
        );
        const id = await PlaylistRepository.createPlaylist(req.session.userId, name);
        res.redirect(`/playlists/${id}`);
    }

    async rename(req, res) {
        const name = validate.requiredString(
            req.body.name,
            'Playlist name',
            config.playlists.maxNameLength
        );
        const renamed = await PlaylistRepository.renamePlaylist(
            req.playlist.id,
            req.session.userId,
            name
        );
        if (!renamed) throw new NotFoundError('Playlist not found');
        res.redirect(`/playlists/${req.playlist.id}`);
    }

    /** Deletes the playlist's uploaded files alongside its rows. */
    async delete(req, res) {
        const localSongs = await PlaylistRepository.getLocalSongsByPlaylistId(req.playlist.id);
        const deleted = await PlaylistRepository.deletePlaylist(
            req.playlist.id,
            req.session.userId
        );
        if (!deleted) throw new NotFoundError('Playlist not found');
        // Rows are gone (ON DELETE CASCADE); orphaned files would otherwise remain forever.
        await UploadService.discardSongs(localSongs);
        res.redirect('/playlists');
    }

    async reorder(req, res) {
        const order = validate.idArray(req.body.order, 'Order');
        try {
            await PlaylistRepository.reorderPlaylists(req.session.userId, order);
        } catch {
            // The transaction rolled back; the order referenced playlists this user
            // does not own, or one vanished mid-request.
            throw new ValidationError('That ordering is no longer valid — please refresh');
        }
        res.json({ success: true });
    }

    /** GET /api/search — JSON for the in-page search box. */
    async apiSearch(req, res) {
        const query = validate.requiredSearchQuery(req.query.q ?? req.query.search);
        const results = await YouTubeService.search(query);
        res.json({ success: true, results });
    }

    async addSong(req, res) {
        const song = await PlaylistRepository.addSong(req.playlist.id, {
            videoId: validate.youtubeVideoId(req.body.videoId),
            title: validate.requiredString(req.body.title, 'Title', config.youtube.maxTitleLength),
            thumbnailUrl: validate.thumbnailUrl(req.body.thumbnailUrl),
            source: PlaylistSong.SOURCE_YOUTUBE
        });
        if (wantsJson(req)) return res.status(201).json({ success: true, song: song.toClient() });
        res.redirect(`/playlists/${req.playlist.id}`);
    }

    /** Add a track from the favorites page, into an existing or brand-new playlist. */
    async addFromSearch(req, res) {
        const userId = req.session.userId;
        const videoId = validate.youtubeVideoId(req.body.videoId);
        const title = validate.requiredString(
            req.body.title,
            'Title',
            config.youtube.maxTitleLength
        );
        const thumbnailUrl = validate.thumbnailUrl(req.body.thumbnailUrl);
        const newName = validate.optionalString(
            req.body.newPlaylistName,
            'Playlist name',
            config.playlists.maxNameLength
        );

        let target;
        if (newName) {
            const id = await PlaylistRepository.createPlaylist(userId, newName);
            target = { id, name: newName };
        } else {
            const playlistId = validate.positiveId(req.body.existingPlaylistId, 'Playlist');
            const owned = await PlaylistRepository.findOwnedPlaylist(playlistId, userId);
            if (!owned) throw new NotFoundError('Playlist not found');
            target = { id: owned.id, name: owned.name };
        }

        await PlaylistRepository.addSong(target.id, {
            videoId,
            title,
            thumbnailUrl,
            source: PlaylistSong.SOURCE_YOUTUBE
        });

        const params = new URLSearchParams({
            search: validate.searchQuery(req.body.currentSearch),
            addedToPlaylistId: String(target.id),
            addedToPlaylistName: target.name
        });
        if (req.get('X-Requested-With') === 'fetch') {
            return res.json({
                success: true,
                addedToPlaylistId: target.id,
                addedToPlaylistName: target.name
            });
        }
        res.redirect(`/favorites?${params}`);
    }

    /**
     * Ownership was confirmed before Multer wrote anything (see loadOwnedPlaylist),
     * so reaching here means the playlist is the caller's. The file still has to
     * prove it is really audio before it is promoted out of the temp directory.
     */
    async uploadSong(req, res) {
        if (!req.file) throw new ValidationError('Please choose an audio file to upload');

        const tempPath = req.file.path;
        try {
            await UploadService.assertWithinQuota(req.session.userId, req.file.size);
            const claimedExtension = path.extname(req.file.originalname || '').toLowerCase();
            const { mime, ext } = await UploadService.detectAudioType(tempPath, claimedExtension);
            const filename = await UploadService.promote(tempPath, ext);

            try {
                await PlaylistRepository.addSong(req.playlist.id, {
                    videoId: filename,
                    title:
                        validate.optionalString(
                            req.body.title,
                            'Title',
                            config.uploads.maxTitleLength
                        ) || req.file.originalname.slice(0, config.uploads.maxTitleLength),
                    thumbnailUrl: null,
                    source: PlaylistSong.SOURCE_LOCAL,
                    mimeType: mime,
                    sizeBytes: req.file.size
                });
            } catch (err) {
                // The row failed after the file landed — do not leave it orphaned.
                await UploadService.discardStored(filename);
                throw err;
            }
        } catch (err) {
            await UploadService.discardTemp(tempPath);
            throw err;
        }

        res.redirect(`/playlists/${req.playlist.id}`);
    }

    async removeSong(req, res) {
        const songId = validate.positiveId(req.body.songId, 'Song id');
        // Read first so the file can be deleted after the row is gone.
        const song = await PlaylistRepository.findSongForUser(songId, req.session.userId);
        const removed =
            song && song.playlistId === req.playlist.id
                ? await PlaylistRepository.removeSong(songId, req.playlist.id)
                : false;

        if (!removed) throw new NotFoundError('Song not found in this playlist');
        if (song.isLocal) await UploadService.discardStored(song.videoId);

        if (wantsJson(req)) return res.json({ success: true });
        res.redirect(`/playlists/${req.playlist.id}`);
    }

    async rateSong(req, res) {
        const songId = validate.positiveId(req.body.songId, 'Song id');
        const rating = validate.rating(req.body.rating);
        const updated = await PlaylistRepository.updateSongRating(songId, req.playlist.id, rating);
        if (!updated) throw new NotFoundError('Song not found in this playlist');

        if (wantsJson(req)) return res.json({ success: true, rating });
        res.redirect(`/playlists/${req.playlist.id}`);
    }
}

module.exports = new PlaylistController();
