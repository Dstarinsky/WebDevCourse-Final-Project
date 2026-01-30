// server/models/User.js
class User {
    constructor(id, email, firstName, lastName, passwordHash, createdAt) {
        this.id = id;
        this.email = email;
        this.firstName = firstName; 
        this.lastName = lastName;
        this.passwordHash = passwordHash;
        this.createdAt = createdAt || new Date().toISOString();
    }
}

module.exports = User;
