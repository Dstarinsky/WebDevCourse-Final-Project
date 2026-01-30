const FavoriteRepository = require('../repositories/FavoriteRepository');
const PlaylistRepository = require('../repositories/PlaylistRepository');
require('dotenv').config();

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
                const apiKey = process.env.YOUTUBE_API_KEY;
                const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&q=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.items) {
                    // Check which results are already favorites
                    searchResults = await Promise.all(data.items.map(async item => {
                        const isFav = await FavoriteRepository.checkIsFavorite(userId, item.id.videoId);
                        return {
                            videoId: item.id.videoId,
                            title: item.snippet.title,
                            thumbnail: item.snippet.thumbnails.medium.url,
                            isFavorite: isFav
                        };
                    }));
                }
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