// server/controllers/YouTubeController.js
const PlaylistRepository = require('../repositories/PlaylistRepository');
require('dotenv').config();

class YouTubeController {

    // GET: Search Page
    async getPage(req, res) {
        const userId = req.session.userId;
        const query = req.query.search || '';
        let searchResults = [];

        try {
            // Fetch User's Playlists
            const playlists = await PlaylistRepository.getUserPlaylists(userId);

            // Perform YouTube Search (Music Only)
            if (query) {
                const apiKey = process.env.YOUTUBE_API_KEY;
                const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=9&q=${encodeURIComponent(query)}&key=${apiKey}`;
                
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

            // Render view
            res.render('favorites', { 
                user: req.session.user,
                searchResults,
                playlists, 
                searchQuery: query,
                // Check URL params for Toast
                addedToPlaylistId: req.query.addedToPlaylistId,
                addedToPlaylistName: req.query.addedToPlaylistName
            });

        } catch (err) {
            console.error(err);
            res.redirect('/');
        }
    }
}

module.exports = new YouTubeController();