// server/models/Favorite.js
class Favorite {
    constructor(id, userId, videoId, title, thumbnailUrl) {
        this.id = id;
        this.userId = userId;
        this.videoId = videoId;
        this.title = title;
        this.thumbnailUrl = thumbnailUrl;
    }
}

module.exports = Favorite;