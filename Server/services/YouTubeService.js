const config = require('../config');
const { AppError, ValidationError } = require('../errors');

/**
 * Raised when the upstream API fails, as distinct from a search that legitimately
 * matched nothing. The old service returned [] for both, so a quota exhaustion
 * (403) was indistinguishable in the UI from "no results".
 */
class YouTubeUnavailableError extends AppError {
    constructor(message = 'Music search is temporarily unavailable') {
        super(message, 503, { code: 'YOUTUBE_UNAVAILABLE' });
    }
}

class YouTubeService {
    constructor() {
        this.cache = new Map();
    }

    get isConfigured() {
        return Boolean(config.youtube.apiKey);
    }

    /**
     * Search YouTube for music videos.
     * @returns {Promise<Array<{videoId, title, thumbnail}>>} possibly empty
     * @throws {YouTubeUnavailableError} when the upstream call fails
     */
    async search(query, maxResults = config.youtube.defaultResults) {
        const trimmed = String(query ?? '').trim();
        if (!trimmed) throw new ValidationError('Search text is required', { field: 'search' });
        if (trimmed.length > config.youtube.maxQueryLength) {
            throw new ValidationError(
                `Search text must be ${config.youtube.maxQueryLength} characters or fewer`,
                { field: 'search' }
            );
        }
        if (!this.isConfigured) return [];

        const count = Math.min(Math.max(1, Number(maxResults) || 1), config.youtube.maxResults);
        const cacheKey = `${count}:${trimmed.toLocaleLowerCase('en-US')}`;
        const cached = this.#readCache(cacheKey);
        if (cached) return cached;

        const url = new URL(config.youtube.searchUrl);
        url.search = new URLSearchParams({
            part: 'snippet',
            type: 'video',
            videoCategoryId: '10', // Music
            maxResults: String(count),
            q: trimmed,
            key: config.youtube.apiKey
        }).toString();

        let response;
        try {
            response = await fetch(url, {
                // Without a timeout an unresponsive API holds the request open.
                signal: AbortSignal.timeout(config.youtube.timeoutMs)
            });
        } catch (err) {
            // Never log `url` — it carries the API key in its query string.
            this.#logFailure('network/timeout', err.message);
            throw new YouTubeUnavailableError();
        }

        if (!response.ok) {
            this.#logFailure(`HTTP ${response.status}`, await response.text().catch(() => ''));
            throw new YouTubeUnavailableError();
        }

        let data;
        try {
            data = await response.json();
        } catch (err) {
            this.#logFailure('invalid JSON', err.message);
            throw new YouTubeUnavailableError();
        }

        if (!Array.isArray(data.items)) {
            this.#logFailure('invalid response shape', 'items was not an array');
            throw new YouTubeUnavailableError();
        }

        const results = data.items
            .map((item) => this.#toResult(item))
            .filter((result) => result !== null);
        this.#writeCache(cacheKey, results);
        return results;
    }

    clearCache() {
        this.cache.clear();
    }

    #readCache(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        if (entry.expiresAt <= Date.now()) {
            this.cache.delete(key);
            return null;
        }
        return entry.results.map((result) => ({ ...result }));
    }

    #writeCache(key, results) {
        if (this.cache.size >= config.youtube.cacheMaxEntries) {
            this.cache.delete(this.cache.keys().next().value);
        }
        this.cache.set(key, {
            expiresAt: Date.now() + config.youtube.cacheTtlMs,
            results: results.map((result) => ({ ...result }))
        });
    }

    /** Defensive mapping — the API occasionally omits nested snippet fields. */
    #toResult(item) {
        const videoId = item?.id?.videoId;
        const title = item?.snippet?.title;
        if (!videoId || !config.youtube.videoIdPattern.test(videoId) || !title) return null;
        const thumbnails = item.snippet.thumbnails || {};
        const thumbnail = (thumbnails.medium || thumbnails.default || {}).url || null;
        return {
            videoId,
            title: String(title).slice(0, config.youtube.maxTitleLength),
            thumbnail
        };
    }

    #logFailure(kind, detail) {
        if (!config.isTest) {
            console.error(`YouTube search failed (${kind}):`, String(detail).slice(0, 300));
        }
    }
}

module.exports = new YouTubeService();
module.exports.YouTubeUnavailableError = YouTubeUnavailableError;
