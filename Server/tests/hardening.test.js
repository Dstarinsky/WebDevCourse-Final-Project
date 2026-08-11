// CSRF, security headers, escaping, and config fail-fast behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { configureTestEnv, startServer, Client, multipart, validMp3Bytes } = require('./helpers');

configureTestEnv();
const app = require('../server');

let server;
let baseURL;

test.before(async () => {
    ({ server, baseURL } = await startServer(app));
});
test.after(() => server.close());

test('state-changing routes reject a request with no CSRF token', async () => {
    const client = await new Client(baseURL).registerAs('csrf@example.com');

    const res = await client.postWithoutCsrf('/playlists/create', {
        form: { name: 'Should Not Exist' }
    });
    assert.equal(res.status, 403);

    // And the playlist really was not created.
    const page = await (await client.get('/playlists')).text();
    assert.ok(!page.includes('Should Not Exist'));
});

test('a CSRF token from a different session is rejected', async () => {
    const victim = await new Client(baseURL).registerAs('csrf-victim@example.com');
    const attacker = await new Client(baseURL).registerAs('csrf-attacker@example.com');

    const stolenToken = await attacker.token();
    const res = await victim.request('POST', '/playlists/create', {
        form: { name: 'Cross Session', _csrf: stolenToken }
    });
    assert.equal(res.status, 403);
});

test('a valid CSRF token is accepted', async () => {
    const client = await new Client(baseURL).registerAs('csrf-ok@example.com');
    const res = await client.post('/playlists/create', { form: { name: 'Legit Playlist' } });
    assert.equal(res.status, 302);
});

test('every state-changing application route is protected by CSRF', async () => {
    const client = await new Client(baseURL).registerAs('csrf-all@example.com');
    const created = await client.post('/playlists/create', { form: { name: 'Protected' } });
    const playlistId = Number(created.headers.get('location').split('/').pop());
    const added = await client.post(`/playlists/${playlistId}/add`, {
        form: { videoId: 'dQw4w9WgXcQ', title: 'Protected song', thumbnailUrl: '' },
        headers: { 'X-Requested-With': 'fetch' }
    });
    const songId = (await added.json()).song.id;

    const requests = [
        ['/favorites/add', { form: { videoId: 'dQw4w9WgXcQ', title: 'X' } }],
        ['/favorites/remove', { form: { videoId: 'dQw4w9WgXcQ' } }],
        ['/playlists/create', { form: { name: 'X' } }],
        ['/playlists/reorder', { body: { order: [playlistId] } }],
        ['/playlists/add-from-search', { form: { videoId: 'dQw4w9WgXcQ' } }],
        ['/playlists/delete', { form: { id: playlistId } }],
        ['/playlists/rename', { form: { id: playlistId, name: 'X' } }],
        [`/playlists/${playlistId}/add`, { form: { videoId: 'dQw4w9WgXcQ' } }],
        [`/playlists/${playlistId}/remove`, { form: { songId } }],
        [`/playlists/${playlistId}/rate`, { form: { songId, rating: 5 } }],
        ['/logout', {}]
    ];
    for (const [route, options] of requests) {
        const response = await client.postWithoutCsrf(route, options);
        assert.equal(response.status, 403, `${route} accepted a mutation without CSRF`);
    }

    const uploadResponse = await client.postWithoutCsrf(`/playlists/${playlistId}/upload`, {
        raw: multipart({
            filename: 'csrf.mp3',
            contentType: 'audio/mpeg',
            content: validMp3Bytes()
        })
    });
    assert.equal(uploadResponse.status, 403);
});

test('logout requires a CSRF token', async () => {
    const client = await new Client(baseURL).registerAs('csrf-logout@example.com');
    assert.equal((await client.postWithoutCsrf('/logout')).status, 403);
    // Still logged in.
    assert.equal((await client.get('/playlists')).status, 200);
});

test('baseline security headers are present', async () => {
    const res = await new Client(baseURL).get('/');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('content-security-policy'), 'a CSP must be set');
    assert.match(res.headers.get('referrer-policy'), /strict-origin/);
});

test('the CSP forbids inline script', async () => {
    const res = await new Client(baseURL).get('/');
    const csp = res.headers.get('content-security-policy');
    const scriptSrc = /script-src ([^;]+)/.exec(csp)[1];
    // Extracting page JavaScript into /js/*.js is what makes this possible.
    assert.ok(
        !scriptSrc.includes("'unsafe-inline'"),
        `script-src must not allow inline: ${scriptSrc}`
    );
    assert.ok(!scriptSrc.includes("'unsafe-eval'"), 'script-src must not allow eval');
});

test('pinned third-party Bootstrap assets carry SRI and anonymous CORS', async () => {
    const html = await (await new Client(baseURL).get('/')).text();
    const cdnTags = html.match(/<(?:link|script)[^>]+cdn\.jsdelivr\.net[^>]*>/g) || [];
    assert.ok(cdnTags.length >= 3, 'expected Bootstrap CSS, icons, and JS tags');
    for (const tag of cdnTags) {
        assert.match(tag, /integrity="sha384-[^"]+"/);
        assert.match(tag, /crossorigin="anonymous"/);
    }
});

test('pages contain no inline event handlers', async () => {
    const client = await new Client(baseURL).registerAs('inline@example.com');
    const create = await client.post('/playlists/create', { form: { name: 'Inline Check' } });
    const playlistId = create.headers.get('location').split('/').pop();

    for (const path of ['/', '/login', '/favorites', `/playlists/${playlistId}`]) {
        const html = await (await client.get(path)).text();
        assert.ok(
            !/\son(click|submit|ended|load|error)=/i.test(html),
            `${path} must not contain inline event handlers`
        );
    }
});

test('a song title containing quotes and markup survives round-trip without corruption', async () => {
    const client = await new Client(baseURL).registerAs('escaping@example.com');
    const create = await client.post('/playlists/create', { form: { name: 'Escaping' } });
    const playlistId = create.headers.get('location').split('/').pop();

    const nastyTitle = `Say "Hello" & <script>alert(1)</script> \\ 'quoted'`;
    await client.post(`/playlists/${playlistId}/add`, {
        form: { videoId: 'dQw4w9WgXcQ', title: nastyTitle, thumbnailUrl: '' },
        headers: { 'X-Requested-With': 'fetch' }
    });

    const html = await (await client.get(`/playlists/${playlistId}`)).text();

    // No executable markup escaped into the page.
    assert.ok(!html.includes('<script>alert(1)</script>'), 'markup must be escaped');

    // data-title must hold the real title, escaped exactly once. The old code ran
    // .replace(/"/g,'&quot;') before EJS escaped the & again, so what the browser
    // decoded back out of dataset.title was a literal "&quot;".
    const dataTitle = /data-title="([^"]*)"/.exec(html)[1];
    const decoded = dataTitle
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&'); // last, so it cannot re-introduce an entity
    assert.equal(decoded, nastyTitle, `data-title round-trip is lossy: ${dataTitle}`);
});

test('config refuses to build without a production session secret', async () => {
    // Fresh module registry so config.js re-evaluates under production settings.
    const original = { ...process.env };
    try {
        process.env.NODE_ENV = 'production';
        delete process.env.SESSION_SECRET;
        delete require.cache[require.resolve('../config')];
        assert.throws(() => require('../config'), /SESSION_SECRET is required/);

        process.env.SESSION_SECRET = 'too-short';
        delete require.cache[require.resolve('../config')];
        assert.throws(() => require('../config'), /at least 32 characters/);
    } finally {
        process.env = original;
        delete require.cache[require.resolve('../config')];
        require('../config');
    }
});

test('deployment pins Node 24 and keeps every stateful path on one persistent disk', () => {
    const render = fs.readFileSync(path.join(__dirname, '../../render.yaml'), 'utf8');
    const packageJson = require('../package.json');
    assert.match(packageJson.engines.node, /24/);
    assert.match(render, /plan:\s+starter/);
    assert.match(render, /numInstances:\s+1/);
    assert.match(render, /mountPath:\s+\/var\/data/);
    for (const [key, value] of [
        ['DB_PATH', '/var/data/music_app.sqlite'],
        ['SESSION_DIR', '/var/data'],
        ['UPLOAD_DIR', '/var/data/uploads'],
        ['BACKUP_DIR', '/var/data/backups']
    ]) {
        assert.match(
            render,
            new RegExp(`key: ${key}[\\s\\S]{0,80}value: ${value.replaceAll('/', '\\/')}`)
        );
    }
});

test('oversized field input is rejected rather than truncated', async () => {
    const client = await new Client(baseURL).registerAs('toolong@example.com');
    const res = await client.post('/playlists/create', { form: { name: 'x'.repeat(500) } });
    assert.equal(res.status, 400);
});

test('search rejects an over-long query', async () => {
    const client = await new Client(baseURL).registerAs('longsearch@example.com');
    const res = await client.get(`/api/search?q=${'x'.repeat(300)}`, {
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(res.status, 400);
});

test('API search rejects an empty query instead of spending upstream quota', async () => {
    const client = await new Client(baseURL).registerAs('emptysearch@example.com');
    const res = await client.get('/api/search?q=%20%20', {
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(res.status, 400);
});

test('search returns an empty result set (not an error) when no API key is configured', async () => {
    const client = await new Client(baseURL).registerAs('nokey@example.com');
    const res = await client.get('/api/search?q=jazz', {
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).results, []);
});
