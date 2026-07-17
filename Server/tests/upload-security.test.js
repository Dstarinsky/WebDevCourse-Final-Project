const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { configureTestEnv, startServer, Client } = require('./helpers');

configureTestEnv();
// Point uploads at a throwaway dir so the test can inspect/clean what was written.
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'musichub-uploads-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

const app = require('../server');

let server, baseURL;

test.before(async () => { ({ server, baseURL } = await startServer(app)); });
test.after(() => { if (server) server.close(); });

// Register + create a playlist; return the authenticated client and playlist id.
async function setup(email) {
    const c = new Client(baseURL);
    await c.post('/register', { form: { username: email, password: 'secret123', firstName: 'U' } });
    await c.post('/playlists/create', { form: { name: 'P' } });
    const loc = (await c.get('/playlists')).headers.get('location') || '';
    return { c, id: (loc.match(/\/playlists\/(\d+)/) || [])[1] };
}

// multipart/form-data upload with a controllable client filename + content-type.
async function upload(c, id, { filename, contentType, bytes }) {
    const fd = new FormData();
    fd.append('mp3file', new Blob([bytes], { type: contentType }), filename);
    fd.append('title', 'x');
    const headers = {};
    if (c.cookie) headers['Cookie'] = c.cookie;
    return fetch(`${baseURL}/playlists/${id}/upload`, { method: 'POST', headers, body: fd, redirect: 'manual' });
}

test('upload with a path-traversal filename cannot escape the uploads dir', async () => {
    const { c, id } = await setup('trav@example.com');
    await upload(c, id, { filename: '../../../pwned.mp3', contentType: 'audio/mpeg', bytes: 'ID3 fake mp3' });

    // Nothing must be written outside the uploads dir.
    const escaped = path.join(UPLOAD_DIR, '../../../pwned.mp3');
    assert.ok(!fs.existsSync(escaped), 'file escaped the uploads directory');

    // Every stored file name is server-generated and contains no separators or "..".
    for (const name of fs.readdirSync(UPLOAD_DIR)) {
        assert.doesNotMatch(name, /\.\.|[\\/]/, `unsafe stored filename: ${name}`);
        assert.match(name, /^\d+-[0-9a-f]{16}\.[a-z0-9]+$/, `unexpected filename: ${name}`);
    }
});

test('a non-audio (.html) upload is rejected even with a spoofed audio mimetype', async () => {
    const { c, id } = await setup('html@example.com');
    await upload(c, id, { filename: 'evil.html', contentType: 'audio/mpeg', bytes: '<script>alert(1)</script>' });

    // The fileFilter must reject it: no .html file may be stored.
    const stored = fs.readdirSync(UPLOAD_DIR);
    assert.ok(!stored.some(n => n.endsWith('.html')), 'an .html file was stored');

    // And the playlist must not have gained a song from the rejected upload.
    const html = await (await c.get(`/playlists/${id}`)).text();
    assert.doesNotMatch(html, /alert\(1\)/);
});

test('a legitimate .mp3 upload still works', async () => {
    const { c, id } = await setup('ok@example.com');
    const res = await upload(c, id, { filename: 'song.mp3', contentType: 'audio/mpeg', bytes: 'ID3 fake mp3 bytes' });
    assert.strictEqual(res.status, 302); // redirect back to the playlist
    assert.ok(fs.readdirSync(UPLOAD_DIR).some(n => n.endsWith('.mp3')), 'no mp3 was stored');
});
