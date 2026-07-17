const PlaylistRepository = require('../repositories/PlaylistRepository');
const YouTubeService = require('../services/YouTubeService');
const { RATING_MIN, RATING_MAX } = require('../constants');
require('dotenv').config({ quiet: true });

class PlaylistController {

    // Returns the playlist only if it belongs to the given user, otherwise null.
    async getOwnedPlaylist(playlistId, userId) {
        const playlist = await PlaylistRepository.getPlaylistById(playlistId);
        if (!playlist || String(playlist.userId) !== String(userId)) return null;
        return playlist;
    }

    // GET /playlists
    // Automatically redirects to the first playlist
    async index(req, res) {
        try {
            const playlists = await PlaylistRepository.getUserPlaylists(req.session.userId);

            if (playlists.length > 0) {
                // Redirect to first playlist
                return res.redirect(`/playlists/${playlists[0].id}`);
            }

            // Only render "index" if NO playlists exist
            res.render('playlists/index', { user: req.session.user, playlists: [] });
        } catch (err) {
            console.error(err);
            res.redirect('/');
        }
    }

    // 2. GET /playlists/:id
    async show(req, res) {
        try {
            const userId = req.session.userId;
            const playlistId = req.params.id;

            const playlist = await this.getOwnedPlaylist(playlistId, userId);
            // If playlist doesn't exist or isn't ours, go back to index
            if (!playlist) return res.redirect('/playlists');

            let songs = await PlaylistRepository.getSongsByPlaylistId(playlistId);
            const allPlaylists = await PlaylistRepository.getUserPlaylists(userId);

            // Filter & Sort Logic
            const filterQuery = req.query.filter || '';
            if (filterQuery) songs = songs.filter(s => s.title.toLowerCase().includes(filterQuery.toLowerCase()));

            const sortBy = req.query.sort || 'default';
            if (sortBy === 'name_asc') songs.sort((a, b) => a.title.localeCompare(b.title));
            else if (sortBy === 'rating_desc') songs.sort((a, b) => b.rating - a.rating);

            // Search Logic
            let searchResults = [];
            if (req.query.search) {
                searchResults = await YouTubeService.search(req.query.search, 5);
            }

            const activeVideoId = req.query.play || (songs.length > 0 ? songs[0].videoId : null);
            const currentSong = songs.find(s => s.videoId === activeVideoId) || (songs.length > 0 ? songs[0] : null);

            res.render('playlists/view', {
                user: req.session.user, playlist, songs, playlists: allPlaylists,
                searchResults, currentSong, activeVideoId: currentSong ? currentSong.videoId : null,
                searchQuery: req.query.search || '', filterQuery: filterQuery, sortBy: sortBy,
                maxRating: RATING_MAX
            });
        } catch (err) { console.error(err); res.redirect('/playlists'); }
    }

    //Move Playlist (Up/Down)
    async reorder(req, res) {
        try {
            // req.body.order will be an array; reorder is scoped to this user in the repo.
            await PlaylistRepository.reorderPlaylists(req.session.userId, req.body.order);
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false });
        }
    }


    async create(req, res) {
        try {
            const name = (req.body.name || '').trim();
            if (name) await PlaylistRepository.createPlaylist(req.session.userId, name);
            res.redirect('/playlists');
        } catch (e) { console.error(e); res.redirect('/playlists'); }
    }
    async rename(req, res) {
        try {
            const name = (req.body.name || '').trim();
            const playlist = await this.getOwnedPlaylist(req.body.id, req.session.userId);
            if (playlist && name) await PlaylistRepository.renamePlaylist(req.body.id, name);
            res.redirect(`/playlists/${req.body.id}`);
        } catch (e) { console.error(e); res.redirect('/playlists'); }
    }
    async delete(req, res) {
        try {
            const playlist = await this.getOwnedPlaylist(req.body.id, req.session.userId);
            if (playlist) await PlaylistRepository.deletePlaylist(req.body.id);
            res.redirect('/playlists');
        } catch (e) { console.error(e); res.redirect('/playlists'); }
    }
    // JSON search endpoint used by the in-page (AJAX) YouTube search.
    async apiSearch(req, res) {
        try {
            const results = await YouTubeService.search(req.query.q || req.query.search || '', 6);
            res.json({ results });
        } catch (err) { console.error(err); res.status(500).json({ results: [] }); }
    }

    async addSong(req, res) {
        try {
            const playlist = await this.getOwnedPlaylist(req.params.id, req.session.userId);
            let newId = null;
            if (playlist) {
                newId = await PlaylistRepository.addSong(req.params.id, req.body.videoId, req.body.title, req.body.thumbnailUrl, 'youtube');
            }
            if (wantsJson(req)) {
                if (!playlist) return res.status(403).json({ success: false });
                return res.json({ success: true, song: {
                    id: newId, videoId: req.body.videoId, title: req.body.title,
                    thumbnailUrl: req.body.thumbnailUrl, source: 'youtube', rating: 0
                }});
            }
            res.redirect(`/playlists/${req.params.id}`);
        } catch (e) {
            console.error(e);
            if (wantsJson(req)) return res.status(500).json({ success: false });
            res.redirect(`/playlists/${req.params.id}`);
        }
    }
    async addFromSearch(req, res) {
        const userId = req.session.userId;
        const { videoId, title, thumbnailUrl, existingPlaylistId, newPlaylistName, currentSearch } = req.body;
        try {
            let targetPlaylistId = null;
            let targetPlaylistName = "";
            if (newPlaylistName && newPlaylistName.trim() !== "") {
                targetPlaylistId = await PlaylistRepository.createPlaylist(userId, newPlaylistName.trim());
                targetPlaylistName = newPlaylistName.trim();
            } else {
                // Only allow adding to a playlist the user actually owns.
                const p = await this.getOwnedPlaylist(existingPlaylistId, userId);
                if (p) { targetPlaylistId = p.id; targetPlaylistName = p.name; }
            }
            if (targetPlaylistId) { await PlaylistRepository.addSong(targetPlaylistId, videoId, title, thumbnailUrl, 'youtube'); }
            const redirectUrl = `/favorites?search=${encodeURIComponent(currentSearch || '')}&addedToPlaylistId=${targetPlaylistId || ''}&addedToPlaylistName=${encodeURIComponent(targetPlaylistName)}`;
            res.redirect(redirectUrl);
        } catch (err) { console.error(err); res.redirect('/favorites'); }
    }
    async uploadSong(req, res) {
        if (!req.file) return res.redirect(`/playlists/${req.params.id}`);
        try {
            const playlist = await this.getOwnedPlaylist(req.params.id, req.session.userId);
            if (playlist) {
                const title = req.body.title || req.file.originalname;
                await PlaylistRepository.addSong(req.params.id, req.file.filename, title, '/images/mp3-icon.png', 'local');
            }
            res.redirect(`/playlists/${req.params.id}`);
        } catch (err) { console.error(err); res.redirect(`/playlists/${req.params.id}`); }
    }
    async removeSong(req, res) {
        try {
            const playlist = await this.getOwnedPlaylist(req.params.id, req.session.userId);
            if (playlist) await PlaylistRepository.removeSong(req.body.songId, req.params.id);
            if (wantsJson(req)) return res.json({ success: !!playlist });
            res.redirect(`/playlists/${req.params.id}`);
        } catch (e) {
            console.error(e);
            if (wantsJson(req)) return res.status(500).json({ success: false });
            res.redirect(`/playlists/${req.params.id}`);
        }
    }
    async rateSong(req, res) {
        try {
            const playlist = await this.getOwnedPlaylist(req.params.id, req.session.userId);
            const rating = Math.max(RATING_MIN, Math.min(RATING_MAX, parseInt(req.body.rating, 10) || 0));
            if (playlist) await PlaylistRepository.updateSongRating(req.body.songId, rating, req.params.id);
            if (wantsJson(req)) return res.json({ success: !!playlist, rating });
            res.redirect(`/playlists/${req.params.id}`);
        } catch (e) {
            console.error(e);
            if (wantsJson(req)) return res.status(500).json({ success: false });
            res.redirect(`/playlists/${req.params.id}`);
        }
    }
}

// True when the request came from our fetch() calls and expects JSON back.
function wantsJson(req) {
    return req.get('X-Requested-With') === 'fetch';
}

module.exports = new PlaylistController();
