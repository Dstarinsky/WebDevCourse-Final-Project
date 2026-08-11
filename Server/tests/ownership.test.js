const test = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv, startServer, Client } = require('./helpers');

configureTestEnv();
const app = require('../server');

let server;
let baseURL;

test.before(async () => {
    ({ server, baseURL } = await startServer(app));
});
test.after(() => server.close());

/** Register a user and give them one playlist; returns { client, playlistId }. */
async function userWithPlaylist(email, playlistName) {
    const client = await new Client(baseURL).registerAs(email);
    const res = await client.post('/playlists/create', { form: { name: playlistName } });
    const playlistId = Number(res.headers.get('location').split('/').pop());
    return { client, playlistId };
}

test('a user can view their own playlist', async () => {
    const { client, playlistId } = await userWithPlaylist('owner@example.com', 'Mine');
    const res = await client.get(`/playlists/${playlistId}`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Mine/);
});

test("a user cannot VIEW another user's playlist (IDOR)", async () => {
    const { playlistId } = await userWithPlaylist('victim1@example.com', 'Secret');
    const attacker = await new Client(baseURL).registerAs('attacker1@example.com');

    const res = await attacker.get(`/playlists/${playlistId}`);
    // 404, not 403 — the response must not confirm that the id exists.
    assert.equal(res.status, 404);
    assert.ok(!(await res.text()).includes('Secret'));
});

test("a user cannot DELETE another user's playlist (IDOR)", async () => {
    const { client: victim, playlistId } = await userWithPlaylist('victim2@example.com', 'Keep');
    const attacker = await new Client(baseURL).registerAs('attacker2@example.com');

    assert.equal(
        (await attacker.post('/playlists/delete', { form: { id: playlistId } })).status,
        404
    );
    // Still there for its owner.
    assert.equal((await victim.get(`/playlists/${playlistId}`)).status, 200);
});

test("a user cannot RENAME another user's playlist (IDOR)", async () => {
    const { client: victim, playlistId } = await userWithPlaylist(
        'victim3@example.com',
        'Original'
    );
    const attacker = await new Client(baseURL).registerAs('attacker3@example.com');

    assert.equal(
        (await attacker.post('/playlists/rename', { form: { id: playlistId, name: 'Hacked' } }))
            .status,
        404
    );
    assert.match(await (await victim.get(`/playlists/${playlistId}`)).text(), /Original/);
});

test("a user cannot ADD a song to another user's playlist", async () => {
    const { playlistId } = await userWithPlaylist('victim4@example.com', 'Locked');
    const attacker = await new Client(baseURL).registerAs('attacker4@example.com');

    const res = await attacker.post(`/playlists/${playlistId}/add`, {
        form: { videoId: 'dQw4w9WgXcQ', title: 'Injected', thumbnailUrl: '' }
    });
    assert.equal(res.status, 404);
});

test('reorder is scoped to the requesting user and rolls back on foreign ids', async () => {
    const { playlistId: victimPlaylist } = await userWithPlaylist('victim5@example.com', 'Theirs');
    const { client: attacker, playlistId: ownPlaylist } = await userWithPlaylist(
        'attacker5@example.com',
        'Ours'
    );

    const res = await attacker.post('/playlists/reorder', {
        body: { order: [ownPlaylist, victimPlaylist] },
        headers: { 'X-Requested-With': 'fetch' }
    });
    // The transaction rolls back rather than partially applying.
    assert.equal(res.status, 400);
});

test('reorder rejects a malformed order payload', async () => {
    const { client } = await userWithPlaylist('reorder@example.com', 'List');
    for (const order of ['not-an-array', [], [1, 1], ['abc']]) {
        const res = await client.post('/playlists/reorder', {
            body: { order },
            headers: { 'X-Requested-With': 'fetch' }
        });
        assert.equal(res.status, 400, `order=${JSON.stringify(order)} should be rejected`);
    }
});

test('reorder rejects a partial list and preserves the complete order', async () => {
    const { client, playlistId: firstId } = await userWithPlaylist(
        'partial-reorder@example.com',
        'First'
    );
    const second = await client.post('/playlists/create', { form: { name: 'Second' } });
    const secondId = Number(second.headers.get('location').split('/').pop());

    const partial = await client.post('/playlists/reorder', {
        body: { order: [secondId] },
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(partial.status, 400);

    const complete = await client.post('/playlists/reorder', {
        body: { order: [secondId, firstId] },
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(complete.status, 200);
});

test('rating rejects out-of-range and non-numeric values', async () => {
    const { client, playlistId } = await userWithPlaylist('rating@example.com', 'Rated');
    const added = await client.post(`/playlists/${playlistId}/add`, {
        form: { videoId: 'dQw4w9WgXcQ', title: 'Track', thumbnailUrl: '' },
        headers: { 'X-Requested-With': 'fetch' }
    });
    const songId = (await added.json()).song.id;

    for (const rating of ['11', '-1', '5abc', 'NaN', '']) {
        const res = await client.post(`/playlists/${playlistId}/rate`, {
            form: { songId, rating },
            headers: { 'X-Requested-With': 'fetch' }
        });
        assert.equal(res.status, 400, `rating=${rating} should be rejected`);
    }

    // A valid rating still works.
    const ok = await client.post(`/playlists/${playlistId}/rate`, {
        form: { songId, rating: '7' },
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).rating, 7);
});

test('rating a song that is not in this playlist returns 404', async () => {
    const { client, playlistId } = await userWithPlaylist('norow@example.com', 'Empty');
    const res = await client.post(`/playlists/${playlistId}/rate`, {
        form: { songId: 999999, rating: '5' },
        headers: { 'X-Requested-With': 'fetch' }
    });
    // Previously this reported success because the playlist existed.
    assert.equal(res.status, 404);
});

test('removing a song that does not exist returns 404', async () => {
    const { client, playlistId } = await userWithPlaylist('noremove@example.com', 'Empty');
    const res = await client.post(`/playlists/${playlistId}/remove`, {
        form: { songId: 999999 },
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(res.status, 404);
});

test('a non-numeric playlist id is a validation error, not a crash', async () => {
    const client = await new Client(baseURL).registerAs('badid@example.com');
    assert.equal((await client.get('/playlists/abc')).status, 400);
});

test('adding a song rejects a malformed video id and a foreign thumbnail host', async () => {
    const { client, playlistId } = await userWithPlaylist('badinput@example.com', 'Strict');

    const badId = await client.post(`/playlists/${playlistId}/add`, {
        form: { videoId: 'not-a-real-id', title: 'X', thumbnailUrl: '' },
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(badId.status, 400);

    const badThumb = await client.post(`/playlists/${playlistId}/add`, {
        form: {
            videoId: 'dQw4w9WgXcQ',
            title: 'X',
            thumbnailUrl: 'https://evil.example.com/x.jpg'
        },
        headers: { 'X-Requested-With': 'fetch' }
    });
    assert.equal(badThumb.status, 400);
});

test('duplicate videos are individually addressable by song row id', async () => {
    const { client, playlistId } = await userWithPlaylist('duplicate-song@example.com', 'Copies');
    const add = () =>
        client.post(`/playlists/${playlistId}/add`, {
            form: { videoId: 'dQw4w9WgXcQ', title: 'Same video', thumbnailUrl: '' },
            headers: { 'X-Requested-With': 'fetch' }
        });
    const firstId = (await (await add()).json()).song.id;
    const secondId = (await (await add()).json()).song.id;
    assert.notEqual(firstId, secondId);

    const secondPage = await (await client.get(`/playlists/${playlistId}?song=${secondId}`)).text();
    assert.match(
        secondPage,
        new RegExp(`class="queue-item playing"[\\s\\S]{0,160}data-song-id="${secondId}"`)
    );

    const other = await client.post('/playlists/create', { form: { name: 'Other' } });
    const otherPlaylistId = Number(other.headers.get('location').split('/').pop());
    assert.equal(
        (await client.get(`/playlists/${otherPlaylistId}?song=${firstId}`)).status,
        404,
        'a song id must belong to the playlist in the route'
    );
});

test('duplicate favorites collapse to a single row', async () => {
    const client = await new Client(baseURL).registerAs('favdup@example.com');
    const form = { videoId: 'dQw4w9WgXcQ', title: 'Same Song', thumbnailUrl: '' };

    await Promise.all([
        client.post('/favorites/add', { form }),
        client.post('/favorites/add', { form })
    ]);

    const html = await (await client.get('/favorites')).text();
    assert.ok(html.includes('Same Song'), 'the favorite should be listed');
    // One saved-tracks card, not two: UNIQUE(userId, videoId) collapses the duplicate.
    const cards = html.split('record-shelf__item').length - 1;
    assert.equal(cards, 1, `expected one saved card, found ${cards}`);
});
