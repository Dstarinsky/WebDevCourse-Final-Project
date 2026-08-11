const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { configureTestEnv, startServer, Client, multipart, validMp3Bytes } = require('./helpers');

configureTestEnv();
process.env.RATE_LIMITS_ENABLED = 'true';
process.env.AUTH_RATE_MAX = '2';
process.env.SEARCH_RATE_MAX = '2';
process.env.UPLOAD_RATE_MAX = '1';
process.env.WRITE_RATE_MAX = '100';

const app = require('../server');

let server;
let baseURL;

test.before(async () => {
    ({ server, baseURL } = await startServer(app));
});
test.after(() => server.close());

test('auth, search, and upload endpoints enforce independent rate policies', async () => {
    const client = await new Client(baseURL).registerAs('limited@example.com');

    const failedLogin = new Client(baseURL);
    assert.equal(
        (
            await failedLogin.post('/login', {
                form: { username: 'limited@example.com', password: 'wrong-password-value' }
            })
        ).status,
        401
    );
    assert.equal(
        (
            await failedLogin.post('/login', {
                form: { username: 'limited@example.com', password: 'another-wrong-value' }
            })
        ).status,
        429
    );

    for (let index = 0; index < 2; index += 1) {
        const response = await client.get(`/api/search?q=query-${index}`, {
            headers: { 'X-Requested-With': 'fetch' }
        });
        assert.equal(response.status, 200);
    }
    const limitedSearch = await client.get('/api/search?q=query-3', {
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(limitedSearch.status, 429);

    const created = await client.post('/playlists/create', { form: { name: 'Rate limited' } });
    const playlistId = Number(created.headers.get('location').split('/').pop());
    const upload = async () => {
        const token = await client.token();
        return client.request('POST', `/playlists/${playlistId}/upload`, {
            raw: multipart({
                filename: 'track.mp3',
                contentType: 'audio/mpeg',
                content: validMp3Bytes(),
                fields: { _csrf: token }
            })
        });
    };

    assert.equal((await upload()).status, 302);
    const afterFirst = fs.readdirSync(process.env.UPLOAD_DIR).length;
    assert.equal((await upload()).status, 429);
    assert.equal(
        fs.readdirSync(process.env.UPLOAD_DIR).length,
        afterFirst,
        'a rate-limited upload must not write a temp or stored file'
    );
});
