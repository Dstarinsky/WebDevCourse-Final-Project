class Favorite {
    constructor({ id, userId, videoId, title, thumbnailUrl, createdAt }) {
        this.id = id;
        this.userId = userId;
        this.videoId = videoId;
        this.title = title;
        this.thumbnailUrl = thumbnailUrl || null;
        this.createdAt = createdAt;
    }

    static fromRow(row) {
        return row ? new Favorite(row) : null;
    }
}

module.exports = Favorite;
