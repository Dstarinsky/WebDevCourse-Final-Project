const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { RateLimitError } = require('../errors');

/**
 * Build a limiter that reports through the central error handler, so a throttled
 * fetch() call gets JSON and a throttled form post gets the error page.
 * Disabled under test so fixtures are not throttled by their own setup.
 */
function limiter({ windowMs, max }, message) {
    if (!config.rateLimits.enabled) return (req, res, next) => next();
    return rateLimit({
        windowMs,
        limit: max,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res, next) => next(new RateLimitError(message))
    });
}

// Brute-force and account-farming control.
const authLimiter = limiter(
    config.rateLimits.auth,
    'Too many attempts. Please wait a few minutes and try again.'
);

// Protects the YouTube API key's quota, which is a shared finite resource.
const searchLimiter = limiter(config.rateLimits.search, 'Too many searches. Please slow down.');

/** Apply the shared YouTube quota policy only when a rendered page runs a search. */
function searchPageLimiter(req, res, next) {
    if (!req.query.search) return next();
    return searchLimiter(req, res, next);
}

// Disk, CPU, and bandwidth protection. Paired with the per-user storage quota in
// UploadService — a rate limit alone bounds speed, not total footprint.
const uploadLimiter = limiter(
    config.rateLimits.upload,
    'Too many uploads. Please try again later.'
);

const writeLimiter = limiter(config.rateLimits.write, 'Too many requests. Please slow down.');

module.exports = {
    authLimiter,
    searchLimiter,
    searchPageLimiter,
    uploadLimiter,
    writeLimiter
};
