const config = require('../config');
const FavoriteRepository = require('../repositories/FavoriteRepository');
const PlaylistRepository = require('../repositories/PlaylistRepository');
const YouTubeService = require('../services/YouTubeService');
const { YouTubeUnavailableError } = require('../services/YouTubeService');
const validate = require('../validation');

class FavoriteController {
    async index(req, res) {
        const userId = req.session.userId;
        const searchQuery = validate.searchQuery(req.query.search);

        // Independent reads run concurrently instead of one after the other.
        const [favorites, playlists] = await Promise.all([
            FavoriteRepository.getAll(userId),
            PlaylistRepository.getUserPlaylists(userId)
        ]);

        let searchResults = [];
        let searchError = null;
        if (searchQuery) {
            try {
                const videos = await YouTubeService.search(searchQuery, config.youtube.maxResults);
                // One query for every result, replacing the previous per-result N+1.
                const saved = await FavoriteRepository.findSavedVideoIds(
                    userId,
                    videos.map((v) => v.videoId)
                );
                searchResults = videos.map((video) => ({
                    ...video,
                    isFavorite: saved.has(video.videoId)
                }));
            } catch (err) {
                if (!(err instanceof YouTubeUnavailableError)) throw err;
                // Distinguish upstream failure from a genuinely empty result set.
                searchError = err.message;
            }
        }

        res.render('favorites', {
            title: `Search Music — ${config.branding.appName}`,
            user: req.session.user,
            favorites,
            playlists,
            searchResults,
            searchQuery,
            searchError,
            addedToPlaylistName: validate.optionalString(
                req.query.addedToPlaylistName,
                'Playlist name',
                config.playlists.maxNameLength
            ),
            addedToPlaylistId: req.query.addedToPlaylistId
                ? validate.positiveId(req.query.addedToPlaylistId, 'Playlist id')
                : null
        });
    }

    async add(req, res) {
        await FavoriteRepository.add(
            req.session.userId,
            validate.youtubeVideoId(req.body.videoId),
            validate.requiredString(req.body.title, 'Title', config.youtube.maxTitleLength),
            validate.thumbnailUrl(req.body.thumbnailUrl)
        );
        if (req.get('X-Requested-With') === 'fetch')
            return res.json({ success: true, addedFavorite: true });
        res.redirect(this.#backToSearch(req));
    }

    async remove(req, res) {
        await FavoriteRepository.remove(
            req.session.userId,
            validate.youtubeVideoId(req.body.videoId)
        );
        if (req.get('X-Requested-With') === 'fetch')
            return res.json({ success: true, removedFavorite: true });
        res.redirect(this.#backToSearch(req));
    }

    /** Preserve the current search when bouncing back to the favorites page. */
    #backToSearch(req) {
        const search = validate.searchQuery(req.body.currentSearch);
        if (!search) return '/favorites';
        return `/favorites?${new URLSearchParams({ search })}`;
    }
}

module.exports = new FavoriteController();
