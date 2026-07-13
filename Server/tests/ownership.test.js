// author: claude
const test = require('node:test');
const assert = require('node:assert');
const { configureTestEnv, startServer, Client } = require('./helpers');

configureTestEnv();
const app = require('../server');

let server, baseURL;

test.before(async () => {
    ({ server, baseURL } = await startServer(app));
});

test.after(() => {
    if (server) server.close();
});

// Register a fresh user and return an authenticated client.
async function registerUser(email) {
    const c = new Client(baseURL);
    await c.post('/register', {
        form: { username: email, password: 'secret123', firstName: email.split('@')[0] }
    });
    return c;
}

// Create a playlist for the given client and return its numeric id.
async function createPlaylist(client, name) {
    await client.post('/playlists/create', { form: { name } });
    // GET /playlists redirects to /playlists/<id> of the (first) playlist.
    const res = await client.get('/playlists');
    const location = res.headers.get('location') || '';
    const match = location.match(/\/playlists\/(\d+)/);
    return match ? match[1] : null;
}

test('a user can view their own playlist', async () => {
    const alice = await registerUser('owner-a@example.com');
    const id = await createPlaylist(alice, 'Alice Mix');
    assert.ok(id, 'expected a playlist id');
    const res = await alice.get(`/playlists/${id}`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.match(html, /Alice Mix/);
});

test('a user cannot VIEW another user\'s playlist (IDOR)', async () => {
    const alice = await registerUser('owner-b@example.com');
    const id = await createPlaylist(alice, 'Private Alice');

    const mallory = await registerUser('mallory-b@example.com');
    const res = await mallory.get(`/playlists/${id}`);
    // Ownership guard redirects away instead of leaking the playlist.
    assert.strictEqual(res.status, 302);
    assert.match(res.headers.get('location'), /\/playlists$/);
});

test('a user cannot DELETE another user\'s playlist (IDOR)', async () => {
    const alice = await registerUser('owner-c@example.com');
    const id = await createPlaylist(alice, 'Keep Me');

    const mallory = await registerUser('mallory-c@example.com');
    const del = await mallory.post('/playlists/delete', { form: { id } });
    assert.strictEqual(del.status, 302);

    // The playlist must still exist and be viewable by its real owner.
    const stillThere = await alice.get(`/playlists/${id}`);
    assert.strictEqual(stillThere.status, 200);
    const html = await stillThere.text();
    assert.match(html, /Keep Me/);
});

test('a user cannot RENAME another user\'s playlist (IDOR)', async () => {
    const alice = await registerUser('owner-d@example.com');
    const id = await createPlaylist(alice, 'Original Name');

    const mallory = await registerUser('mallory-d@example.com');
    await mallory.post('/playlists/rename', { form: { id, name: 'Hacked' } });

    const res = await alice.get(`/playlists/${id}`);
    const html = await res.text();
    assert.match(html, /Original Name/);
    assert.doesNotMatch(html, /Hacked/);
});

test('reorder is scoped to the requesting user', async () => {
    const alice = await registerUser('owner-e@example.com');
    const id = await createPlaylist(alice, 'Reorder Me');

    const mallory = await registerUser('mallory-e@example.com');
    // Mallory tries to reorder a playlist she does not own; should not error out the app.
    const res = await mallory.post('/playlists/reorder', { body: { order: [id] } });
    assert.strictEqual(res.status, 200);
    // Alice's playlist is unaffected and still loads.
    assert.strictEqual((await alice.get(`/playlists/${id}`)).status, 200);
});
