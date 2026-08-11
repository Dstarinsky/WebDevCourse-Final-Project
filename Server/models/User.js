class User {
    constructor({ id, email, firstName, lastName, passwordHash, createdAt }) {
        this.id = id;
        this.email = email;
        this.firstName = firstName;
        this.lastName = lastName || '';
        this.passwordHash = passwordHash;
        this.createdAt = createdAt || new Date().toISOString();
    }

    static fromRow(row) {
        return row ? new User(row) : null;
    }

    /**
     * The only shape that may leave the server — no password hash.
     * Storing the full entity in the session previously serialised the bcrypt hash
     * into the session store and exposed it to every template as `res.locals.user`.
     */
    toPublic() {
        return { id: this.id, email: this.email, firstName: this.firstName };
    }
}

module.exports = User;
