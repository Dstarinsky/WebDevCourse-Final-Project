const multer = require('multer');
const config = require('../config');
const { AppError, PayloadTooLargeError, UnsupportedMediaTypeError } = require('../errors');

/** True when the request came from our fetch() calls and expects JSON back. */
function wantsJson(req) {
    return (
        req.get('X-Requested-With') === 'fetch' ||
        req.path.startsWith('/api/') ||
        req.accepts(['html', 'json']) === 'json'
    );
}

/**
 * Wrap an async route handler so a rejected promise reaches the error middleware
 * instead of hanging the request. Replaces the try/catch + console.error + redirect
 * block that used to be copy-pasted into every controller method.
 */
function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Translate Multer's own errors into typed application errors. */
function normalise(err) {
    if (err instanceof multer.MulterError) {
        switch (err.code) {
            case 'LIMIT_FILE_SIZE':
                return new PayloadTooLargeError(
                    `Files must be under ${Math.round(config.uploads.maxBytes / 1024 / 1024)} MB`
                );
            case 'LIMIT_UNEXPECTED_FILE':
                return new UnsupportedMediaTypeError('Unexpected file field');
            default:
                return new PayloadTooLargeError('Upload rejected: too many parts or fields');
        }
    }
    if (err && err.type === 'entity.too.large') {
        return new PayloadTooLargeError('Request body too large');
    }
    return err;
}

function notFound(req, res, next) {
    const { NotFoundError } = require('../errors');
    next(new NotFoundError(`No route matches ${req.method} ${req.path}`));
}

/**
 * Terminal error middleware. Answers /api and fetch requests with JSON and
 * everything else with a rendered page — an API call is never redirected to HTML.
 */
function errorHandler(err, req, res, next) {
    const error = normalise(err);

    // Safety net: if a request failed after Multer wrote a temp file (a rejected CSRF
    // token, a validation error, anything), that file must not be left behind.
    // Controllers clean up their own successful paths; this covers everything that
    // never reached a controller.
    if (req.file && req.file.path) {
        require('fs')
            .promises.unlink(req.file.path)
            .catch(() => {});
    }

    // Third-party middleware (csrf-sync, http-errors) signals its status this way
    // rather than by extending AppError.
    const externalStatus = Number(error.status || error.statusCode);
    const status =
        error instanceof AppError
            ? error.status
            : externalStatus >= 400 && externalStatus < 600
              ? externalStatus
              : 500;

    // Only 5xx is genuinely unexpected; logging every 400 turns the log into noise.
    // DEBUG_ERRORS surfaces them during test runs, where logging is otherwise off.
    if ((status >= 500 && !config.isTest) || process.env.DEBUG_ERRORS) {
        console.error(`${req.method} ${req.originalUrl}`, error);
    }

    const safeMessage =
        error instanceof AppError && error.expose
            ? error.message
            : status === 403
              ? 'Your session expired or the form was invalid — please try again.'
              : 'Something went wrong on our end.';

    if (res.headersSent) return next(error);

    if (wantsJson(req)) {
        return res.status(status).json({
            success: false,
            error: { code: error.code || 'INTERNAL', message: safeMessage }
        });
    }

    res.status(status).render('error', {
        title: `${status} — ${config.branding.appName}`,
        user: (req.session && req.session.user) || null,
        status,
        message: safeMessage
    });
}

module.exports = { asyncHandler, errorHandler, notFound, wantsJson };
