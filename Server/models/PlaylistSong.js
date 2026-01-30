class PlaylistSong {
    constructor(id, playlistId, videoId, title, thumbnailUrl, position) {
        this.id = id;
        this.playlistId = playlistId;
        this.videoId = videoId;
        this.title = title;
        this.thumbnailUrl = thumbnailUrl;
        this.position = position;
    }
}
module.exports = PlaylistSong;