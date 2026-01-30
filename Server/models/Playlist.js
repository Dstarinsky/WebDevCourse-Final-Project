class Playlist {
    constructor(id, userId, name, createdAt) {
        this.id = id;
        this.userId = userId;
        this.name = name;
        this.createdAt = createdAt;
        this.songs = []; 
    }
}
module.exports = Playlist;