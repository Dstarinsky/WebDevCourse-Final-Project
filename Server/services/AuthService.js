// server/services/AuthService.js
const UserRepository = require('../repositories/UserRepository');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

class AuthService {
    

    async register(dto) {
        // Check if user exists
        const existing = await UserRepository.findByEmail(dto.email);
        if (existing) {
            throw new Error("User already exists");
        }

        // Hash Password 
        const hashedPassword = await bcrypt.hash(dto.password, 10);

        // Create User Instance
        const newUser = new User(null, dto.email, dto.firstName, dto.lastName, hashedPassword);

        // Save to Repo
        return await UserRepository.create(newUser);
    }


    async login(dto) {
        const user = await UserRepository.findByEmail(dto.email);
        if (!user) {
            throw new Error("Invalid credentials");
        }

        const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
        if (!isMatch) {
            throw new Error("Invalid credentials");
        }

        return user;
    }
}

module.exports = new AuthService();