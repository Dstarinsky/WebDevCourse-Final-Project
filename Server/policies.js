// Domain policy values have one owner and do not vary by deployment. Environment-
// dependent paths, secrets, ports, and operational tuning remain in config.js.
const MiB = 1024 * 1024;

module.exports = Object.freeze({
    auth: Object.freeze({
        minPasswordLength: 15,
        maxPasswordLength: 128,
        maxPasswordBytes: 512,
        maxEmailLength: 254,
        maxNameLength: 100
    }),
    rating: Object.freeze({ min: 0, max: 10 }),
    playlists: Object.freeze({ maxNameLength: 120, maxReorderItems: 500 }),
    uploads: Object.freeze({
        defaultMaxBytes: 25 * MiB,
        maxTitleLength: 200,
        defaultMaxFilesPerUser: 200,
        defaultMaxBytesPerUser: 500 * MiB,
        allowedTypes: Object.freeze({
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.ogg': 'audio/ogg',
            '.oga': 'audio/ogg',
            '.wav': 'audio/wav',
            '.flac': 'audio/flac',
            '.aac': 'audio/aac'
        })
    }),
    youtube: Object.freeze({
        searchUrl: 'https://www.googleapis.com/youtube/v3/search',
        maxResults: 8,
        defaultResults: 6,
        maxQueryLength: 100,
        maxTitleLength: 300,
        videoIdPattern: /^[A-Za-z0-9_-]{11}$/,
        allowedThumbnailHosts: Object.freeze(['i.ytimg.com', 'img.youtube.com', 'i9.ytimg.com'])
    })
});
