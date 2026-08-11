const db = require('../database/db');
const User = require('../models/User');

class UserRepository {
    /** Case-insensitive by schema: users.email is COLLATE NOCASE. */
    async findByEmail(email) {
        return User.fromRow(await db.get('SELECT * FROM users WHERE email = ?', [email]));
    }

    async create(user) {
        const { lastID } = await db.run(
            `INSERT INTO users (email, firstName, lastName, passwordHash, createdAt)
             VALUES (?, ?, ?, ?, ?)`,
            [user.email, user.firstName, user.lastName, user.passwordHash, user.createdAt]
        );
        user.id = lastID;
        return user;
    }

    async updatePasswordHash(userId, passwordHash) {
        const { changes } = await db.run('UPDATE users SET passwordHash = ? WHERE id = ?', [
            passwordHash,
            userId
        ]);
        return changes > 0;
    }
}

module.exports = new UserRepository();
