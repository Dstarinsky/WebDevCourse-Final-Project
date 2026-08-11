const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const PlaylistRepository = require('../repositories/PlaylistRepository');
const { UnsupportedMediaTypeError, PayloadTooLargeError, NotFoundError } = require('../errors');

// `file-type` is ESM-only; import once and reuse.
let fileTypeModule = null;
async function loadFileType() {
    if (!fileTypeModule) fileTypeModule = await import('file-type');
    return fileTypeModule;
}

class UploadService {
    constructor() {
        fs.mkdirSync(config.uploads.dir, { recursive: true });
    }

    /**
     * Filename written to disk. Fully server-generated: the client's originalname is
     * never used in a path, which is what closes the path-traversal / arbitrary-write
     * hole. The extension is decided from the file's real content after the write.
     */
    generateFilename(detectedExt) {
        const ext = detectedExt || '.bin';
        return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    }

    /** Absolute path of a stored upload, guaranteed to stay inside the upload dir. */
    resolveStoredPath(filename) {
        // basename() strips any directory component a stored value might contain, and
        // the containment check catches anything basename alone would not.
        const safe = path.basename(String(filename || ''));
        const resolved = path.resolve(config.uploads.dir, safe);
        const root = path.resolve(config.uploads.dir);
        if (resolved !== root && !resolved.startsWith(root + path.sep)) {
            throw new NotFoundError('File not found');
        }
        return resolved;
    }

    /**
     * Confirm the bytes really are audio.
     * An extension allowlist plus a Content-Type header only proves what the client
     * *claimed*; both are attacker-controlled. This reads the file's magic bytes.
     * @returns {{mime: string, ext: string}}
     */
    async detectAudioType(filePath, claimedExtension) {
        const { fileTypeFromFile } = await loadFileType();
        const detected = await fileTypeFromFile(filePath);
        if (!detected) {
            throw new UnsupportedMediaTypeError('Could not recognise that file as audio');
        }
        const allowedMimes = new Set(Object.values(config.uploads.allowedTypes));
        const normalisedExt = `.${detected.ext}`;
        const expectedExt = String(claimedExtension || '').toLowerCase();
        const equivalentExtensions = [new Set(['.ogg', '.oga'])];
        const extensionsAgree =
            expectedExt === normalisedExt ||
            equivalentExtensions.some(
                (group) => group.has(expectedExt) && group.has(normalisedExt)
            );
        if (!extensionsAgree) {
            throw new UnsupportedMediaTypeError(
                `File contents do not match the ${expectedExt || 'selected'} extension`
            );
        }
        // Accept when either the detected MIME or its extension maps into the
        // allowlist — container/codec naming varies (m4a reports audio/mp4, for
        // instance) and the two spellings do not always agree.
        const mime = allowedMimes.has(detected.mime)
            ? detected.mime
            : config.uploads.allowedTypes[normalisedExt];
        if (!mime) {
            throw new UnsupportedMediaTypeError(`${detected.mime} is not a supported audio format`);
        }
        return { mime, ext: normalisedExt };
    }

    /** Reject an upload that would push the user past their storage quota. */
    async assertWithinQuota(userId, incomingBytes) {
        const { fileCount, totalBytes } = await PlaylistRepository.getUploadUsage(userId);
        if (fileCount + 1 > config.uploads.maxFilesPerUser) {
            throw new PayloadTooLargeError(
                `Upload limit reached (${config.uploads.maxFilesPerUser} files)`
            );
        }
        if (totalBytes + incomingBytes > config.uploads.maxBytesPerUser) {
            const mb = Math.round(config.uploads.maxBytesPerUser / 1024 / 1024);
            throw new PayloadTooLargeError(`Storage limit reached (${mb} MB)`);
        }
    }

    /** Rename a validated temp file to its final content-derived name. */
    async promote(tempPath, ext) {
        const filename = this.generateFilename(ext);
        await fsp.rename(tempPath, this.resolveStoredPath(filename));
        return filename;
    }

    /** Best-effort stored-file delete; the path always passes the containment check. */
    async discardStored(filename) {
        if (!filename) return true;
        try {
            await fsp.unlink(this.resolveStoredPath(filename));
            return true;
        } catch (err) {
            if (err.code === 'ENOENT') return true;
            if (!config.isTest) {
                console.warn(
                    `Upload cleanup deferred for ${path.basename(filename)}: ${err.code || 'error'}`
                );
            }
            return false;
        }
    }

    /** Delete only a Multer temp file created by this application. */
    async discardTemp(tempPath) {
        if (!tempPath) return true;
        const resolved = path.resolve(tempPath);
        const isOwnedTemp =
            path.dirname(resolved) === path.resolve(os.tmpdir()) &&
            path.basename(resolved).startsWith('musichub-upload-');
        if (!isOwnedTemp) return false;
        try {
            await fsp.unlink(resolved);
            return true;
        } catch (err) {
            return err.code === 'ENOENT';
        }
    }

    /** Delete the backing files of several local songs. */
    async discardSongs(songs) {
        await Promise.all(
            songs.filter((song) => song.isLocal).map((song) => this.discardStored(song.videoId))
        );
    }

    /** Compare private storage with DB references; optionally remove safe orphans. */
    async reconcile({ deleteOrphans = false } = {}) {
        const songs = await PlaylistRepository.getAllLocalSongs();
        const referenced = new Set(songs.map((song) => path.basename(song.videoId)));
        const entries = await fsp.readdir(config.uploads.dir, { withFileTypes: true });
        const stored = entries
            .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
            .map((entry) => entry.name);
        const orphans = stored.filter((name) => !referenced.has(name));
        const storedSet = new Set(stored);
        const missing = songs
            .filter((song) => !storedSet.has(path.basename(song.videoId)))
            .map((song) => ({ id: song.id, filename: path.basename(song.videoId) }));

        const deleted = [];
        if (deleteOrphans) {
            for (const filename of orphans) {
                if (await this.discardStored(filename)) deleted.push(filename);
            }
        }
        return { referenced: referenced.size, stored: stored.length, orphans, missing, deleted };
    }

    async statStored(filename) {
        return fsp.stat(this.resolveStoredPath(filename));
    }
}

module.exports = new UploadService();
