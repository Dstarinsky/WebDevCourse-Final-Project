const FavoriteRepository = require('../repositories/FavoriteRepository');
const PlaylistRepository = require('../repositories/PlaylistRepository');
const YouTubeService = require('../services/YouTubeService');
require('dotenv').config({ quiet: true });

class FavoriteController {

    async index(req, res) {
        try {
            const userId = req.session.userId;
            
            // Get Data for View (Favorites + Playlists for the modal)
            const favorites = await FavoriteRepository.getAll(userId);
            const playlists = await PlaylistRepository.getUserPlaylists(userId);

            // Handle Search
            let searchResults = [];
            let searchQuery = req.query.search || '';

            if (searchQuery) {
                const videos = await YouTubeService.search(searchQuery, 8);
                // Check which results are already favorites
                searchResults = await Promise.all(videos.map(async video => ({
                    ...video,
                    isFavorite: await FavoriteRepository.checkIsFavorite(userId, video.videoId)
                })));
            }

            res.render('favorites', { 
                user: req.session.user, 
                favorites, 
                playlists, 
                searchResults, 
                searchQuery,
                addedToPlaylistName: req.query.addedToPlaylistName,
                addedToPlaylistId: req.query.addedToPlaylistId
            });

        } catch (err) {
            console.error(err);
            res.redirect('/');
        }
    }

    async add(req, res) {
        try {
            await FavoriteRepository.add(req.session.userId, req.body.videoId, req.body.title, req.body.thumbnailUrl);
            // Redirect back keeping the search query if it exists
            const redirectUrl = req.body.currentSearch ? `/favorites?search=${encodeURIComponent(req.body.currentSearch)}` : '/favorites';
            res.redirect(redirectUrl);
        } catch (err) {
            console.error(err);
            res.redirect('/favorites');
        }
    }

    async remove(req, res) {
        try {
            await FavoriteRepository.remove(req.session.userId, req.body.videoId);
            res.redirect('/favorites');
        } catch (err) {
            console.error(err);
            res.redirect('/favorites');
        }
    }
}

module.exports = new FavoriteController();