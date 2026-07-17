const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

class YouTubeService {
    // Searches YouTube for music videos. Returns [] if no API key is configured
    // or the API returns no results.
    async search(query, maxResults = 5) {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) return [];

        const url = `${YOUTUBE_SEARCH_URL}?part=snippet&type=video&videoCategoryId=10&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!data.items) return [];

        return data.items.map(item => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium.url
        }));
    }
}

module.exports = new YouTubeService();
