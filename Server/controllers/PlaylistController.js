const PlaylistRepository = require('../repositories/PlaylistRepository');
require('dotenv').config();

class PlaylistController {

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
            
            const playlist = await PlaylistRepository.getPlaylistById(playlistId);
            // If playlist doesn't exist (e.g. deleted), go back to index
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
                const apiKey = process.env.YOUTUBE_API_KEY;
                const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=5&q=${encodeURIComponent(req.query.search)}&key=${apiKey}`;
                const response = await fetch(url);
                const data = await response.json();
                if (data.items) {
                    searchResults = data.items.map(item => ({
                        videoId: item.id.videoId,
                        title: item.snippet.title,
                        thumbnail: item.snippet.thumbnails.medium.url
                    }));
                }
            }

            const activeVideoId = req.query.play || (songs.length > 0 ? songs[0].videoId : null);
            const currentSong = songs.find(s => s.videoId === activeVideoId) || (songs.length > 0 ? songs[0] : null);

            res.render('playlists/view', { 
                user: req.session.user, playlist, songs, playlists: allPlaylists, 
                searchResults, currentSong, activeVideoId: currentSong ? currentSong.videoId : null,
                searchQuery: req.query.search || '', filterQuery: filterQuery, sortBy: sortBy
            });
        } catch (err) { console.error(err); res.redirect('/playlists'); }
    }

    //Move Playlist (Up/Down)
    async reorder(req, res) {
        try {
            // req.body.order will be an array
            await PlaylistRepository.reorderPlaylists(req.session.userId, req.body.order);
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false });
        }
    }

   
    async create(req, res) {
        try { await PlaylistRepository.createPlaylist(req.session.userId, req.body.name); res.redirect('/playlists'); } catch(e){ res.redirect('/playlists'); }
    }
    async rename(req, res) {
        try { await PlaylistRepository.renamePlaylist(req.body.id, req.body.name); res.redirect(`/playlists/${req.body.id}`); } catch(e){ res.redirect('/playlists'); }
    }
    async delete(req, res) {
        try { await PlaylistRepository.deletePlaylist(req.body.id); res.redirect('/playlists'); } catch(e){ res.redirect('/playlists'); }
    }
    async addSong(req, res) {
        try { await PlaylistRepository.addSong(req.params.id, req.body.videoId, req.body.title, req.body.thumbnailUrl, 'youtube'); res.redirect(`/playlists/${req.params.id}`); } catch(e){ res.redirect(`/playlists/${req.params.id}`); }
    }
    async addFromSearch(req, res) {
        const userId = req.session.userId;
        const { videoId, title, thumbnailUrl, existingPlaylistId, newPlaylistName, currentSearch } = req.body;
        try {
            let targetPlaylistId = existingPlaylistId;
            let targetPlaylistName = "";
            if (newPlaylistName && newPlaylistName.trim() !== "") {
                targetPlaylistId = await PlaylistRepository.createPlaylist(userId, newPlaylistName);
                targetPlaylistName = newPlaylistName;
            } else {
                const p = await PlaylistRepository.getPlaylistById(targetPlaylistId);
                targetPlaylistName = p ? p.name : "Playlist";
            }
            if (targetPlaylistId) { await PlaylistRepository.addSong(targetPlaylistId, videoId, title, thumbnailUrl, 'youtube'); }
            const redirectUrl = `/favorites?search=${encodeURIComponent(currentSearch)}&addedToPlaylistId=${targetPlaylistId}&addedToPlaylistName=${encodeURIComponent(targetPlaylistName)}`;
            res.redirect(redirectUrl);
        } catch (err) { console.error(err); res.redirect('/favorites'); }
    }
    async uploadSong(req, res) {
        if (!req.file) return res.redirect(`/playlists/${req.params.id}`);
        try {
            const title = req.body.title || req.file.originalname;
            await PlaylistRepository.addSong(req.params.id, req.file.filename, title, '/images/mp3-icon.png', 'local');
            res.redirect(`/playlists/${req.params.id}`);
        } catch (err) { console.error(err); res.redirect(`/playlists/${req.params.id}`); }
    }
    async removeSong(req, res) {
        try { await PlaylistRepository.removeSong(req.body.songId); res.redirect(`/playlists/${req.params.id}`); } catch(e){ res.redirect(`/playlists/${req.params.id}`); }
    }
    async rateSong(req, res) {
        try { await PlaylistRepository.updateSongRating(req.body.songId, req.body.rating); res.redirect(`/playlists/${req.params.id}`); } catch(e){ res.redirect(`/playlists/${req.params.id}`); }
    }
}
module.exports = new PlaylistController();