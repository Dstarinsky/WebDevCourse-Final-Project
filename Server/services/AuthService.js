const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config');
const UserRepository = require('../repositories/UserRepository');
const User = require('../models/User');
const validate = require('../validation');
const { AuthenticationError, ConflictError } = require('../errors');

class AuthService {
    static HASH_PREFIX = '{MUSIC-HUB-SHA384-BCRYPT}';

    /**
     * bcrypt only processes the first 72 bytes. SHA-384's base64url digest is a
     * fixed 64-character representation, so every byte of an accepted password
     * influences the bcrypt input. The stored prefix makes the scheme versioned and
     * lets existing plain-bcrypt accounts migrate on their next successful login.
     */
    #bcryptInput(password) {
        return `sha384:${crypto.createHash('sha384').update(password, 'utf8').digest('base64url')}`;
    }

    async #hashPassword(password) {
        const hash = await bcrypt.hash(this.#bcryptInput(password), config.auth.bcryptRounds);
        return `${AuthService.HASH_PREFIX}${hash}`;
    }

    async #verifyPassword(password, storedHash) {
        if (storedHash.startsWith(AuthService.HASH_PREFIX)) {
            return bcrypt.compare(
                this.#bcryptInput(password),
                storedHash.slice(AuthService.HASH_PREFIX.length)
            );
        }
        return bcrypt.compare(password, storedHash);
    }

    /**
     * Validate, normalise, and persist a new account.
     * Returns the User entity; callers must store only `toPublic()` in the session.
     */
    async register(input) {
        // Build a clean object rather than mutating the caller's.
        const credentials = {
            email: validate.email(input.email),
            firstName: validate.requiredString(
                input.firstName,
                'First name',
                config.auth.maxNameLength
            ),
            lastName: validate.optionalString(
                input.lastName,
                'Last name',
                config.auth.maxNameLength
            ),
            password: validate.password(input.password)
        };

        if (await UserRepository.findByEmail(credentials.email)) {
            throw new ConflictError('An account with that email already exists');
        }

        const passwordHash = await this.#hashPassword(credentials.password);
        return UserRepository.create(
            new User({
                id: null,
                email: credentials.email,
                firstName: credentials.firstName,
                lastName: credentials.lastName,
                passwordHash
            })
        );
    }

    async login(input) {
        // Deliberately vague and identical for both failure modes so the response
        // cannot be used to enumerate which emails have accounts.
        const invalid = () => new AuthenticationError('Invalid email or password');

        let normalisedEmail;
        try {
            normalisedEmail = validate.email(input.email);
        } catch {
            throw invalid();
        }

        const password = validate.loginPassword(input.password);
        const user = await UserRepository.findByEmail(normalisedEmail);
        if (!user) {
            // Hash anyway so a missing account is not measurably faster than a wrong
            // password (timing oracle).
            await bcrypt.hash(this.#bcryptInput(password), config.auth.bcryptRounds);
            throw invalid();
        }

        if (!password || !(await this.#verifyPassword(password, user.passwordHash))) {
            throw invalid();
        }
        if (!user.passwordHash.startsWith(AuthService.HASH_PREFIX)) {
            user.passwordHash = await this.#hashPassword(password);
            await UserRepository.updatePasswordHash(user.id, user.passwordHash);
        }
        return user;
    }

    /**
     * Install an authenticated session.
     * `regenerate` issues a fresh session ID, which closes session fixation: without
     * it an attacker who plants a known ID before login still holds it afterwards.
     */
    async startSession(req, user) {
        await new Promise((resolve, reject) => {
            req.session.regenerate((err) => (err ? reject(err) : resolve()));
        });
        req.session.userId = user.id;
        req.session.user = user.toPublic();
        await new Promise((resolve, reject) => {
            req.session.save((err) => (err ? reject(err) : resolve()));
        });
    }

    async endSession(req) {
        await new Promise((resolve, reject) => {
            req.session.destroy((err) => (err ? reject(err) : resolve()));
        });
    }
}

module.exports = new AuthService();
