// Reusable input validators applied at the route boundary.
//
// Previously input was either unchecked or silently coerced: `parseInt` accepted
// "5abc", an out-of-range rating became 0 instead of an error, and no field had a
// maximum length. Everything here throws ValidationError, which the central error
// handler turns into a 400 with a safe message.
const config = require('./config');
const { ValidationError } = require('./errors');
const { isCommonPassword } = require('./security/passwords');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed non-empty string within `max` characters. */
function requiredString(value, field, max) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new ValidationError(`${field} is required`, { field });
    if (text.length > max) {
        throw new ValidationError(`${field} must be ${max} characters or fewer`, { field });
    }
    return text;
}

function optionalString(value, field, max) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length > max) {
        throw new ValidationError(`${field} must be ${max} characters or fewer`, { field });
    }
    return text;
}

/** Strict integer — rejects "5abc", "", null, and floats, which parseInt accepts. */
function integer(value, field) {
    const text = String(value ?? '').trim();
    if (!/^-?\d+$/.test(text)) {
        throw new ValidationError(`${field} must be a whole number`, { field });
    }
    return Number.parseInt(text, 10);
}

function positiveId(value, field) {
    const id = integer(value, field);
    if (id < 1) throw new ValidationError(`${field} must be a positive id`, { field });
    return id;
}

function email(value) {
    const text = requiredString(value, 'Email', config.auth.maxEmailLength).toLowerCase();
    if (!EMAIL_PATTERN.test(text)) {
        throw new ValidationError('Please enter a valid email address', { field: 'email' });
    }
    return text;
}

/**
 * Password policy. bcrypt ignores input past 72 bytes, so a longer password would be
 * accepted while only its first 72 bytes were ever verified — reject rather than
 * silently truncate. Length is measured in bytes because multi-byte characters count
 * against bcrypt's limit.
 */
function password(value) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new ValidationError('Password is required', { field: 'password' });
    }
    if (value.length < config.auth.minPasswordLength) {
        throw new ValidationError(
            `Password must be at least ${config.auth.minPasswordLength} characters`,
            { field: 'password' }
        );
    }
    if (value.length > config.auth.maxPasswordLength) {
        throw new ValidationError(
            `Password must be ${config.auth.maxPasswordLength} characters or fewer`,
            { field: 'password' }
        );
    }
    if (Buffer.byteLength(value, 'utf8') > config.auth.maxPasswordBytes) {
        throw new ValidationError(
            `Password must be ${config.auth.maxPasswordBytes} bytes or fewer`,
            { field: 'password' }
        );
    }
    if (isCommonPassword(value)) {
        throw new ValidationError('Choose a password that is not commonly used or compromised', {
            field: 'password'
        });
    }
    return value;
}

/** Login keeps legacy weak passwords usable, but still bounds attacker input. */
function loginPassword(value) {
    if (typeof value !== 'string' || value.length === 0) return '';
    if (
        value.length > config.auth.maxPasswordLength ||
        Buffer.byteLength(value, 'utf8') > config.auth.maxPasswordBytes
    ) {
        return '';
    }
    return value;
}

function rating(value) {
    const parsed = integer(value, 'Rating');
    const { min, max } = config.rating;
    if (parsed < min || parsed > max) {
        throw new ValidationError(`Rating must be between ${min} and ${max}`, { field: 'rating' });
    }
    return parsed;
}

/** A YouTube video ID, not an arbitrary string used as one. */
function youtubeVideoId(value) {
    const text = String(value ?? '').trim();
    if (!config.youtube.videoIdPattern.test(text)) {
        throw new ValidationError('Invalid video id', { field: 'videoId' });
    }
    return text;
}

/**
 * Thumbnail URLs arrive from hidden form fields, so they are client-controlled.
 * Restrict them to https on known YouTube image hosts — otherwise the field is an
 * open redirect into <img src> and a tracking vector.
 */
function thumbnailUrl(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    let parsed;
    try {
        parsed = new URL(text);
    } catch {
        throw new ValidationError('Invalid thumbnail URL', { field: 'thumbnailUrl' });
    }
    if (
        parsed.protocol !== 'https:' ||
        !config.youtube.allowedThumbnailHosts.includes(parsed.hostname)
    ) {
        throw new ValidationError('Thumbnail must be a YouTube image URL', {
            field: 'thumbnailUrl'
        });
    }
    return parsed.toString();
}

function searchQuery(value) {
    const text = String(value ?? '').trim();
    if (text.length > config.youtube.maxQueryLength) {
        throw new ValidationError(
            `Search text must be ${config.youtube.maxQueryLength} characters or fewer`,
            { field: 'search' }
        );
    }
    return text;
}

function requiredSearchQuery(value) {
    const text = searchQuery(value);
    if (!text) {
        throw new ValidationError('Search text is required', { field: 'search' });
    }
    return text;
}

/** Array of unique positive integer ids, as sent by the drag-and-drop reorder. */
function idArray(value, field) {
    if (!Array.isArray(value)) {
        throw new ValidationError(`${field} must be an array`, { field });
    }
    if (value.length === 0) {
        throw new ValidationError(`${field} must not be empty`, { field });
    }
    if (value.length > config.playlists.maxReorderItems) {
        throw new ValidationError(`${field} has too many entries`, { field });
    }
    const ids = value.map((v) => positiveId(v, field));
    if (new Set(ids).size !== ids.length) {
        throw new ValidationError(`${field} contains duplicate ids`, { field });
    }
    return ids;
}

module.exports = {
    requiredString,
    optionalString,
    integer,
    positiveId,
    email,
    password,
    loginPassword,
    rating,
    youtubeVideoId,
    thumbnailUrl,
    searchQuery,
    requiredSearchQuery,
    idArray,
    EMAIL_PATTERN
};
