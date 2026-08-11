const { csrfSync } = require('csrf-sync');

/**
 * Synchronizer-token CSRF protection.
 *
 * SameSite=Lax blocks the common cross-site form post but is not by itself an
 * authorization mechanism: it does not cover same-site sibling origins, login CSRF,
 * or older/relaxed cookie behaviour. The token is kept in the existing session, so
 * no extra cookie or parser is needed.
 */
const { generateToken, csrfSynchronisedProtection } = csrfSync({
    getTokenFromState: (req) => req.session.csrfToken,
    storeTokenInState: (req, token) => {
        req.session.csrfToken = token;
    },
    // Forms send `_csrf`; fetch() sends the X-CSRF-Token header.
    getTokenFromRequest: (req) => req.body?._csrf || req.get('x-csrf-token')
});

/**
 * Publish the token to every template as `csrfToken`, so layout partials and forms
 * can embed it without each route remembering to pass it through.
 */
function exposeCsrfToken(req, res, next) {
    res.locals.csrfToken = generateToken(req);
    next();
}

module.exports = { csrfProtection: csrfSynchronisedProtection, exposeCsrfToken, generateToken };
