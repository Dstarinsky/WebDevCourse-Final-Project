const SOURCE_YOUTUBE = 'youtube';
const SOURCE_LOCAL = 'local';

class PlaylistSong {
    constructor({
        id,
        playlistId,
        videoId,
        title,
        thumbnailUrl,
        position = 0,
        source = SOURCE_YOUTUBE,
        rating = 0,
        mimeType = null,
        sizeBytes = null
    }) {
        this.id = id;
        this.playlistId = playlistId;
        // For a YouTube track this is the 11-character video ID; for an upload it is
        // the server-generated filename on disk.
        this.videoId = videoId;
        this.title = title;
        this.thumbnailUrl = thumbnailUrl || null;
        this.position = position;
        this.source = source;
        this.rating = rating;
        this.mimeType = mimeType;
        this.sizeBytes = sizeBytes;
    }

    static fromRow(row) {
        return row ? new PlaylistSong(row) : null;
    }

    get isLocal() {
        return this.source === SOURCE_LOCAL;
    }

    /** Shape sent to the browser. Never exposes the on-disk filename for uploads —
     *  local audio is fetched through the ownership-checked /media/:songId route. */
    toClient() {
        return {
            id: this.id,
            videoId: this.isLocal ? null : this.videoId,
            title: this.title,
            thumbnailUrl: this.thumbnailUrl,
            source: this.source,
            rating: this.rating,
            mediaUrl: this.isLocal ? `/media/${this.id}` : null
        };
    }
}

PlaylistSong.SOURCE_YOUTUBE = SOURCE_YOUTUBE;
PlaylistSong.SOURCE_LOCAL = SOURCE_LOCAL;

module.exports = PlaylistSong;
