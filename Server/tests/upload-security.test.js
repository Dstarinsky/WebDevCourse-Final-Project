const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { configureTestEnv, startServer, Client, multipart, validMp3Bytes } = require('./helpers');

const tmp = configureTestEnv();
const app = require('../server');
const config = require('../config');
const UPLOAD_DIR = process.env.UPLOAD_DIR;

let server;
let baseURL;

test.before(async () => {
    ({ server, baseURL } = await startServer(app));
});
test.after(() => server.close());

const listUploads = () =>
    fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR).filter((f) => f !== '.gitkeep') : [];

async function userWithPlaylist(email, name = 'Uploads') {
    const client = await new Client(baseURL).registerAs(email);
    const res = await client.post('/playlists/create', { form: { name } });
    return { client, playlistId: Number(res.headers.get('location').split('/').pop()) };
}

/** POST a multipart upload with the client's CSRF token. */
async function upload(client, playlistId, file) {
    const token = await client.token();
    const raw = multipart({ ...file, fields: { ...file.fields, _csrf: token } });
    return client.request('POST', `/playlists/${playlistId}/upload`, { raw });
}

test('a legitimate audio upload is stored and playable through /media', async () => {
    const { client, playlistId } = await userWithPlaylist('good@example.com');
    const before = listUploads().length;

    const res = await upload(client, playlistId, {
        filename: 'song.mp3',
        contentType: 'audio/mpeg',
        content: validMp3Bytes(),
        fields: { title: 'My Track' }
    });
    assert.equal(res.status, 302);
    assert.equal(listUploads().length, before + 1);

    const page = await (await client.get(`/playlists/${playlistId}`)).text();
    assert.match(page, /My Track/);
    // The on-disk filename must never appear in the page — playback goes via /media/:id.
    const stored = listUploads().at(-1);
    assert.ok(!page.includes(stored), 'stored filename must not be exposed to the browser');
    assert.match(page, /\/media\/\d+/);
});

test('upload with a path-traversal filename cannot escape the uploads dir', async () => {
    const { client, playlistId } = await userWithPlaylist('traversal@example.com');
    const escapeTarget = path.join(tmp, 'pwned.mp3');

    await upload(client, playlistId, {
        filename: '../../pwned.mp3',
        contentType: 'audio/mpeg',
        content: validMp3Bytes()
    });

    assert.ok(!fs.existsSync(escapeTarget), 'no file may be written outside the upload dir');
    // Anything stored uses a server-generated name.
    for (const name of listUploads()) {
        assert.ok(!name.includes('..'), `stored name must be sanitised, got ${name}`);
        assert.ok(!name.includes('pwned'), 'client filename must not be reused');
    }
});

test('a non-audio file is rejected even with a spoofed audio mimetype', async () => {
    const { client, playlistId } = await userWithPlaylist('spoof@example.com');
    const before = listUploads().length;

    const res = await upload(client, playlistId, {
        filename: 'evil.html',
        contentType: 'audio/mpeg',
        content: '<script>alert(1)</script>'
    });
    assert.equal(res.status, 415);
    assert.equal(listUploads().length, before, 'nothing may be written');
});

test('non-audio BYTES named .mp3 with an audio mimetype are rejected by content inspection', async () => {
    const { client, playlistId } = await userWithPlaylist('magic@example.com');
    const before = listUploads().length;

    // Passes the extension allowlist AND the mimetype check — only reading the
    // file's magic bytes catches this.
    const res = await upload(client, playlistId, {
        filename: 'notreally.mp3',
        contentType: 'audio/mpeg',
        content: '<!DOCTYPE html><html><body>definitely not audio</body></html>'
    });
    assert.equal(res.status, 415);
    assert.equal(listUploads().length, before, 'rejected bytes must be cleaned up');
});

test('extension and detected signature must agree', async () => {
    const { client, playlistId } = await userWithPlaylist('mismatch@example.com');
    const before = listUploads().length;

    const res = await upload(client, playlistId, {
        filename: 'pretends-to-be.wav',
        contentType: 'audio/wav',
        content: validMp3Bytes()
    });
    assert.equal(res.status, 415);
    assert.equal(listUploads().length, before, 'a mismatched file must be cleaned up');
});

test("uploading to another user's playlist writes zero files", async () => {
    const { playlistId: victimPlaylist } = await userWithPlaylist('victim-up@example.com');
    const attacker = await new Client(baseURL).registerAs('attacker-up@example.com');
    const before = listUploads().length;

    const res = await upload(attacker, victimPlaylist, {
        filename: 'sneak.mp3',
        contentType: 'audio/mpeg',
        content: validMp3Bytes()
    });
    assert.equal(res.status, 404);
    // Ownership is checked BEFORE multer runs, so no orphan is left behind.
    assert.equal(
        listUploads().length,
        before,
        'no bytes may be written for an unauthorised upload'
    );
});

test('uploading to a nonexistent playlist writes zero files', async () => {
    const { client } = await userWithPlaylist('ghost@example.com');
    const before = listUploads().length;

    const res = await upload(client, 999999, {
        filename: 'ghost.mp3',
        contentType: 'audio/mpeg',
        content: validMp3Bytes()
    });
    assert.equal(res.status, 404);
    assert.equal(listUploads().length, before);
});

test('another user cannot stream your uploaded file', async () => {
    const { client, playlistId } = await userWithPlaylist('media-owner@example.com');
    await upload(client, playlistId, {
        filename: 'private.mp3',
        contentType: 'audio/mpeg',
        content: validMp3Bytes(),
        fields: { title: 'Private Track' }
    });

    const page = await (await client.get(`/playlists/${playlistId}`)).text();
    const mediaUrl = /\/media\/(\d+)/.exec(page);
    assert.ok(mediaUrl, 'a media URL should be rendered');

    // The owner can stream it.
    const ownerResponse = await client.get(mediaUrl[0]);
    assert.equal(ownerResponse.status, 200);
    assert.match(ownerResponse.headers.get('content-type'), /^audio\/mpeg/);
    assert.equal(ownerResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.match(ownerResponse.headers.get('cache-control'), /private/);

    // A different logged-in user cannot.
    const attacker = await new Client(baseURL).registerAs('media-thief@example.com');
    assert.equal((await attacker.get(mediaUrl[0])).status, 404);

    // Nor can an anonymous visitor.
    const anon = new Client(baseURL);
    assert.equal((await anon.get(mediaUrl[0])).status, 302);
});

test('uploads are not reachable as static files', async () => {
    const anon = new Client(baseURL);
    for (const p of ['/uploads/', '/storage/uploads/', '/uploads/anything.mp3']) {
        const res = await anon.get(p);
        assert.ok(res.status === 404 || res.status === 302, `${p} must not be served statically`);
    }
});

test('deleting a song removes its file from disk', async () => {
    const { client, playlistId } = await userWithPlaylist('cleanup@example.com');
    await upload(client, playlistId, {
        filename: 'temp.mp3',
        contentType: 'audio/mpeg',
        content: validMp3Bytes(),
        fields: { title: 'Delete Me' }
    });

    const countAfterUpload = listUploads().length;
    const page = await (await client.get(`/playlists/${playlistId}`)).text();
    const songId = /data-song-id="(\d+)"/.exec(page)[1];

    const res = await client.post(`/playlists/${playlistId}/remove`, {
        form: { songId },
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(res.status, 200);
    assert.equal(
        listUploads().length,
        countAfterUpload - 1,
        'the file must be deleted with its row'
    );
});

test('deleting a playlist removes its uploaded files', async () => {
    const { client, playlistId } = await userWithPlaylist('cascade@example.com');
    await upload(client, playlistId, {
        filename: 'cascade.mp3',
        contentType: 'audio/mpeg',
        content: validMp3Bytes(),
        fields: { title: 'Cascade' }
    });

    const before = listUploads().length;
    const res = await client.post('/playlists/delete', { form: { id: playlistId } });
    assert.equal(res.status, 302);
    assert.equal(listUploads().length, before - 1, 'orphaned files must not survive the playlist');
});

test('an oversized upload is refused', async () => {
    const { client, playlistId } = await userWithPlaylist('big@example.com');
    const before = listUploads().length;

    // One byte over the configured 25 MB cap.
    const oversized = Buffer.concat([validMp3Bytes(), Buffer.alloc(25 * 1024 * 1024)]);
    const res = await upload(client, playlistId, {
        filename: 'huge.mp3',
        contentType: 'audio/mpeg',
        content: oversized
    });

    assert.ok(res.status >= 400, `expected rejection, got ${res.status}`);
    assert.equal(listUploads().length, before);
});

test('per-user file-count quota prevents unbounded authenticated storage', async () => {
    const { client, playlistId } = await userWithPlaylist('quota@example.com');
    const originalLimit = config.uploads.maxFilesPerUser;
    try {
        config.uploads.maxFilesPerUser = 1;
        assert.equal(
            (
                await upload(client, playlistId, {
                    filename: 'first.mp3',
                    contentType: 'audio/mpeg',
                    content: validMp3Bytes()
                })
            ).status,
            302
        );
        const afterFirst = listUploads().length;
        const rejected = await upload(client, playlistId, {
            filename: 'second.mp3',
            contentType: 'audio/mpeg',
            content: validMp3Bytes()
        });
        assert.equal(rejected.status, 413);
        assert.equal(listUploads().length, afterFirst);
    } finally {
        config.uploads.maxFilesPerUser = originalLimit;
    }
});
