// server/repositories/UserRepository.js
const db = require('../database/db');
const User = require('../models/User');

class UserRepository {
    

    async findByEmail(email) {
        return new Promise((resolve, reject) => {
            db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                resolve(new User(row.id, row.email, row.firstName, row.lastName, row.passwordHash, row.createdAt));
            });
        });
    }


    async findById(id) {
        return new Promise((resolve, reject) => {
            db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
                if (err) return reject(err);
                if (!row) return resolve(null);
                resolve(new User(row.id, row.email, row.firstName, row.lastName, row.passwordHash, row.createdAt));
            });
        });
    }


    async create(user) {
        return new Promise((resolve, reject) => {
            const sql = "INSERT INTO users (email, firstName, lastName, passwordHash, createdAt) VALUES (?,?,?,?,?)";
            const params = [user.email, user.firstName, user.lastName, user.passwordHash, user.createdAt];
            
            db.run(sql, params, function(err) {
                if (err) return reject(err);
                user.id = this.lastID; // Assign the auto-generated ID
                resolve(user);
            });
        });
    }
}

module.exports = new UserRepository();