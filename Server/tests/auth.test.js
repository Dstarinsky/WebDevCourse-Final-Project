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

test('public pages render', async () => {
    const c = new Client(baseURL);
    assert.strictEqual((await c.get('/')).status, 200);
    assert.strictEqual((await c.get('/login')).status, 200);
    assert.strictEqual((await c.get('/register')).status, 200);
});

test('protected routes redirect anonymous users to /login', async () => {
    const c = new Client(baseURL);
    const fav = await c.get('/favorites');
    assert.strictEqual(fav.status, 302);
    assert.match(fav.headers.get('location'), /\/login$/);

    const create = await c.post('/playlists/create', { form: { name: 'Hack' } });
    assert.strictEqual(create.status, 302);
    assert.match(create.headers.get('location'), /\/login$/);
});

test('registration creates a session and grants access', async () => {
    const c = new Client(baseURL);
    const reg = await c.post('/register', {
        form: { username: 'alice@example.com', password: 'secret123', firstName: 'Alice', lastName: 'A' }
    });
    assert.strictEqual(reg.status, 302);
    assert.strictEqual(reg.headers.get('location'), '/');

    // Now authenticated: favorites should render (200), not redirect.
    const fav = await c.get('/favorites');
    assert.strictEqual(fav.status, 200);
});

test('registration rejects a too-short password', async () => {
    const c = new Client(baseURL);
    const reg = await c.post('/register', {
        form: { username: 'bob@example.com', password: '123', firstName: 'Bob' }
    });
    // Re-renders the register page with an error instead of redirecting.
    assert.strictEqual(reg.status, 200);
    const html = await reg.text();
    assert.match(html, /at least 6 characters/i);
});

test('duplicate email is rejected', async () => {
    const c = new Client(baseURL);
    await c.post('/register', {
        form: { username: 'dup@example.com', password: 'secret123', firstName: 'Dup' }
    });
    const c2 = new Client(baseURL);
    const reg = await c2.post('/register', {
        form: { username: 'dup@example.com', password: 'secret123', firstName: 'Dup2' }
    });
    assert.strictEqual(reg.status, 200);
    const html = await reg.text();
    assert.match(html, /already exists/i);
});

test('login with wrong password shows an error', async () => {
    const c = new Client(baseURL);
    await c.post('/register', {
        form: { username: 'carol@example.com', password: 'secret123', firstName: 'Carol' }
    });
    const c2 = new Client(baseURL);
    const res = await c2.post('/login', {
        form: { username: 'carol@example.com', password: 'wrongpass' }
    });
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.match(html, /invalid credentials/i);
});

test('logout clears the session', async () => {
    const c = new Client(baseURL);
    await c.post('/register', {
        form: { username: 'dave@example.com', password: 'secret123', firstName: 'Dave' }
    });
    assert.strictEqual((await c.get('/favorites')).status, 200);
    const out = await c.get('/logout');
    assert.strictEqual(out.status, 302);
    // After logout the protected route redirects again.
    const fav = await c.get('/favorites');
    assert.strictEqual(fav.status, 302);
    assert.match(fav.headers.get('location'), /\/login$/);
});
