const os = require('os');
const multer = require('multer');
const path = require('path');
const config = require('../config');
const { UnsupportedMediaTypeError } = require('../errors');

/**
 * Multipart intake for audio uploads.
 *
 * Files land in the OS temp directory first and are only promoted into the (private)
 * upload directory after their magic bytes are confirmed to be audio — see
 * UploadService.detectAudioType. Nothing unvalidated is ever written where it can be
 * served.
 *
 * The extension/mimetype filter below is a cheap early reject, not the real check:
 * both values come from the request and are trivially spoofed.
 */
const storage = multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
        // Server-generated; the client's originalname never reaches a path.
        cb(null, `musichub-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: config.uploads.maxBytes,
        files: 1,
        // Bound the non-file parts too: fileSize alone leaves field count and field
        // size unbounded, which is its own memory-exhaustion path.
        fields: 10,
        fieldSize: 4 * 1024,
        parts: 12
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const looksLikeAudio =
            (file.mimetype || '').startsWith('audio/') &&
            Object.hasOwn(config.uploads.allowedTypes, ext);
        if (!looksLikeAudio) {
            return cb(new UnsupportedMediaTypeError('Choose a supported audio file'));
        }
        cb(null, true);
    }
});

module.exports = { uploadSingleAudio: upload.single('mp3file') };
