const AuthService = require('../services/AuthService');
const config = require('../config');
const { AppError } = require('../errors');

class AuthController {
    showLogin(req, res) {
        if (req.session.userId) return res.redirect('/playlists');
        res.render('login', {
            title: `Login — ${config.branding.appName}`,
            error: null,
            values: {}
        });
    }

    showRegister(req, res) {
        if (req.session.userId) return res.redirect('/playlists');
        res.render('register', {
            title: `Register — ${config.branding.appName}`,
            error: null,
            values: {}
        });
    }

    async register(req, res) {
        const values = {
            email: req.body.username || '',
            firstName: req.body.firstName || '',
            lastName: req.body.lastName || ''
        };
        await this.#authenticate(req, res, 'register', values, () =>
            AuthService.register({ ...values, password: req.body.password })
        );
    }

    async login(req, res) {
        const values = { email: req.body.username || '' };
        await this.#authenticate(req, res, 'login', values, () =>
            AuthService.login({ email: values.email, password: req.body.password })
        );
    }

    /**
     * Shared by register and login: start a session on success, or re-render the
     * form with a safe message and the user's non-secret input preserved.
     *
     * The failure branch answers with the real status (400/401/409) instead of the
     * 200 the old redirect-on-error produced. A thunk is taken rather than a pending
     * promise so the rejection is never briefly unobserved.
     */
    async #authenticate(req, res, view, values, action) {
        try {
            const user = await action();
            await AuthService.startSession(req, user);
            res.redirect('/playlists');
        } catch (err) {
            // Unexpected failures propagate to the central handler as a 500.
            if (!(err instanceof AppError)) throw err;
            res.status(err.status).render(view, {
                title: `${view === 'login' ? 'Login' : 'Register'} — ${config.branding.appName}`,
                error: err.message,
                values
            });
        }
    }

    async logout(req, res) {
        await AuthService.endSession(req);
        // Clear the exact cookie the session was issued under.
        res.clearCookie(config.session.cookieName, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: config.isProduction
        });
        res.redirect('/login');
    }
}

module.exports = new AuthController();
