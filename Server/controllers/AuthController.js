// server/controllers/AuthController.js
const AuthService = require('../services/AuthService');

class AuthController {

    showLogin(req, res) {
        res.render('login', { error: null });
    }

    showRegister(req, res) {
        res.render('register', { error: null });
    }

    async register(req, res) {
        const dto = {
            email: req.body.username,
            password: req.body.password,
            firstName: req.body.firstName,
            lastName: req.body.lastName || ''
        };
        await this.authenticate(req, res, AuthService.register(dto), 'register');
    }

    async login(req, res) {
        const dto = {
            email: req.body.username,
            password: req.body.password
        };
        await this.authenticate(req, res, AuthService.login(dto), 'login');
    }

    // Shared by register/login: writes the session on success and
    // re-renders `view` with the error message on failure.
    async authenticate(req, res, authPromise, view) {
        try {
            const user = await authPromise;
            req.session.userId = user.id;
            req.session.user = user;
            res.redirect('/');
        } catch (err) {
            res.render(view, { error: err.message });
        }
    }

    logout(req, res) {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    }
}

module.exports = new AuthController();
