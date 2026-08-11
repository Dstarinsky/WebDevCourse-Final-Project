class Playlist {
    constructor({ id, userId, name, createdAt, position = 0, songs = [] }) {
        this.id = id;
        this.userId = userId;
        this.name = name;
        this.createdAt = createdAt;
        this.position = position;
        this.songs = songs;
    }

    static fromRow(row) {
        return row ? new Playlist(row) : null;
    }
}

module.exports = Playlist;
