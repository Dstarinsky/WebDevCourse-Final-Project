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
        try {
            // Data Transfer Object 
            const dto = {
                email: req.body.username, 
                password: req.body.password,
                firstName: req.body.firstName,
                lastName: req.body.lastName || ''
            };

            const user = await AuthService.register(dto);

            // Write to Session
            req.session.userId = user.id;
            req.session.user = user;

            res.redirect('/');
        } catch (err) {
            res.render('register', { error: err.message });
        }
    }

    
    async login(req, res) {
        try {
            const dto = {
                email: req.body.username,
                password: req.body.password
            };

            const user = await AuthService.login(dto);

            // Write to Session
            req.session.userId = user.id;
            req.session.user = user;

            res.redirect('/');
        } catch (err) {
            res.render('login', { error: err.message });
        }
    }

    logout(req, res) {
        // Clears Session
        req.session.destroy(() => {
            res.redirect('/login');
        });
    }
}

module.exports = new AuthController();