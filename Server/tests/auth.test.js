const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');
const { configureTestEnv, startServer, Client } = require('./helpers');

configureTestEnv();
const app = require('../server');
const config = require('../config');
const db = require('../database/db');
const AuthService = require('../services/AuthService');

let server;
let baseURL;

test.before(async () => {
    ({ server, baseURL } = await startServer(app));
});
test.after(() => server.close());

test('public pages render', async () => {
    const client = new Client(baseURL);
    for (const path of ['/', '/login', '/register']) {
        const res = await client.get(path);
        assert.equal(res.status, 200, `${path} should render`);
    }
});

test('protected routes redirect anonymous users to /login', async () => {
    const client = new Client(baseURL);
    for (const path of ['/playlists', '/favorites']) {
        const res = await client.get(path);
        assert.equal(res.status, 302);
        assert.equal(res.headers.get('location'), '/login');
    }
});

test('registration creates a session and grants access', async () => {
    const client = new Client(baseURL);
    const res = await client.post('/register', {
        form: {
            username: 'new@example.com',
            password: 'a-good-password',
            firstName: 'New',
            lastName: 'User'
        }
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/playlists');

    const playlists = await client.get('/playlists');
    assert.equal(playlists.status, 200);
});

test('registration rejects a password below the configured minimum', async () => {
    const client = new Client(baseURL);
    const res = await client.post('/register', {
        form: { username: 'short@example.com', password: 'abc', firstName: 'Short' }
    });
    // A validation failure is a 400, not the 200 the old redirect-on-error produced.
    assert.equal(res.status, 400);
    // Asserted against the config value so the test cannot drift from the policy.
    assert.match(
        await res.text(),
        new RegExp(`at least ${config.auth.minPasswordLength} characters`, 'i')
    );
});

test('registration rejects a password longer than the configured maximum', async () => {
    const client = new Client(baseURL);
    const res = await client.post('/register', {
        form: {
            username: 'long@example.com',
            password: 'x'.repeat(config.auth.maxPasswordLength + 1),
            firstName: 'Long'
        }
    });
    assert.equal(res.status, 400);
    assert.match(
        await res.text(),
        new RegExp(`${config.auth.maxPasswordLength} characters or fewer`, 'i')
    );
});

test('a long password is verified in full, not truncated at bcrypt 72 bytes', async () => {
    // The SHA-384 pre-hash means every byte participates. Two passwords sharing a
    // 72-byte prefix must NOT be interchangeable.
    const base = 'p'.repeat(72);
    const client = new Client(baseURL);
    const created = await client.post('/register', {
        form: { username: 'longpw@example.com', password: `${base}-alpha`, firstName: 'Long' }
    });
    assert.equal(created.status, 302);

    const impostor = new Client(baseURL);
    const res = await impostor.post('/login', {
        form: { username: 'longpw@example.com', password: `${base}-omega` }
    });
    assert.equal(res.status, 401, 'a different suffix past 72 bytes must not authenticate');
});

test('registration rejects a common compromised password', async () => {
    const client = new Client(baseURL);
    const res = await client.post('/register', {
        form: {
            username: 'common@example.com',
            password: 'password123456789',
            firstName: 'Common'
        }
    });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /commonly used or compromised/i);
});

test('registration rejects a malformed email', async () => {
    const client = new Client(baseURL);
    const res = await client.post('/register', {
        form: { username: 'not-an-email', password: 'a-good-password', firstName: 'Nope' }
    });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /valid email/i);
});

test('duplicate email is rejected, case-insensitively', async () => {
    const client = new Client(baseURL);
    await client.post('/register', {
        form: { username: 'dup@example.com', password: 'a-good-password', firstName: 'First' }
    });

    const other = new Client(baseURL);
    const res = await other.post('/register', {
        // Different casing must collide with the existing account.
        form: { username: 'DUP@Example.com', password: 'a-good-password', firstName: 'Second' }
    });
    assert.equal(res.status, 409);
    assert.match(await res.text(), /already exists/i);
});

test('login is case-insensitive on email', async () => {
    const client = new Client(baseURL);
    await client.post('/register', {
        form: { username: 'case@example.com', password: 'a-good-password', firstName: 'Case' }
    });

    const other = new Client(baseURL);
    const res = await other.post('/login', {
        form: { username: 'CASE@EXAMPLE.COM', password: 'a-good-password' }
    });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/playlists');
});

test('a successful legacy bcrypt login upgrades the stored hash scheme', async () => {
    const password = 'legacy-password-value';
    const legacyHash = await bcrypt.hash(password, config.auth.bcryptRounds);
    await db.run(
        `INSERT INTO users (email, firstName, lastName, passwordHash, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        ['legacy-hash@example.com', 'Legacy', '', legacyHash, new Date().toISOString()]
    );

    const client = new Client(baseURL);
    const response = await client.post('/login', {
        form: { username: 'legacy-hash@example.com', password }
    });
    assert.equal(response.status, 302);
    const row = await db.get('SELECT passwordHash FROM users WHERE email = ?', [
        'legacy-hash@example.com'
    ]);
    assert.ok(row.passwordHash.startsWith(AuthService.constructor.HASH_PREFIX));
});

test('login with wrong password returns 401 and a generic message', async () => {
    const client = new Client(baseURL);
    await client.post('/register', {
        form: { username: 'wrongpw@example.com', password: 'a-good-password', firstName: 'Who' }
    });

    const other = new Client(baseURL);
    const res = await other.post('/login', {
        form: { username: 'wrongpw@example.com', password: 'not-the-password' }
    });
    assert.equal(res.status, 401);
    const body = await res.text();
    // Identical wording for both failure modes, so the response cannot be used to
    // enumerate which emails have accounts.
    assert.match(body, /Invalid email or password/i);
});

test('login with an unknown email gives the same message as a wrong password', async () => {
    const client = new Client(baseURL);
    const res = await client.post('/login', {
        form: { username: 'nobody@example.com', password: 'whatever-password' }
    });
    assert.equal(res.status, 401);
    assert.match(await res.text(), /Invalid email or password/i);
});

test('logout clears the session', async () => {
    const client = await new Client(baseURL).registerAs('logout@example.com');
    // A new account has no playlists, so this renders the empty state.
    assert.equal((await client.get('/playlists')).status, 200);

    const res = await client.post('/logout');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/login');

    const after = await client.get('/playlists');
    assert.equal(after.headers.get('location'), '/login');
});

test('logout is not reachable over GET', async () => {
    const client = await new Client(baseURL).registerAs('getlogout@example.com');
    const res = await client.get('/logout');
    // A GET logout could be fired by any third-party <img src="/logout">.
    assert.equal(res.status, 404);
    // Session survives.
    assert.notEqual((await client.get('/playlists')).headers.get('location'), '/login');
});

test('the session never stores or renders the password hash', async () => {
    const client = await new Client(baseURL).registerAs('nohash@example.com');
    const html = await (await client.get('/playlists')).text();
    assert.ok(!html.includes('$2'), 'rendered HTML must not contain a bcrypt hash');
    assert.ok(!/passwordHash/i.test(html), 'rendered HTML must not mention passwordHash');

    const sessionDatabase = new sqlite3.Database(
        path.join(process.env.SESSION_DIR, process.env.SESSION_DB)
    );
    const rows = await new Promise((resolve, reject) => {
        sessionDatabase.all('SELECT sess FROM sessions', (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
    await new Promise((resolve, reject) => {
        sessionDatabase.close((err) => (err ? reject(err) : resolve()));
    });
    assert.ok(rows.length > 0, 'the session store should contain authenticated sessions');
    for (const row of rows) {
        assert.ok(!/passwordHash|\$2[aby]\$/i.test(row.sess), 'stored session leaked a hash');
        const payload = JSON.parse(row.sess);
        if (payload.user) {
            assert.deepEqual(
                Object.keys(payload.user).sort(),
                ['email', 'firstName', 'id'],
                'session user must be the safe projection only'
            );
        }
    }
});

test('logging in regenerates the session id (fixation defence)', async () => {
    const client = new Client(baseURL);
    await client.get('/login');
    const before = client.cookie;

    await client.post('/register', {
        form: { username: 'fixation@example.com', password: 'a-good-password', firstName: 'Fix' }
    });
    assert.notEqual(client.cookie, before, 'session cookie must change on authentication');
});

test('unknown routes return a real 404, not a redirect', async () => {
    const client = new Client(baseURL);
    const res = await client.get('/no-such-page');
    assert.equal(res.status, 404);
});

test('unknown API routes return JSON, not an HTML redirect', async () => {
    const client = await new Client(baseURL).registerAs('api404@example.com');
    const res = await client.get('/api/nope', { headers: { 'X-Requested-With': 'fetch' } });
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /json/);
    assert.equal((await res.json()).success, false);
});

test('/healthz reports datastore reachability', async () => {
    const client = new Client(baseURL);
    const res = await client.get('/healthz');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
});
