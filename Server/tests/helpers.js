const os = require('os');
const path = require('path');
const fs = require('fs');

/** Configure a throwaway environment BEFORE the app (and config.js) are required. */
function configureTestEnv() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'musichub-test-'));
    process.env.NODE_ENV = 'test';
    process.env.DB_PATH = path.join(tmp, 'test.sqlite');
    process.env.SESSION_DIR = tmp;
    process.env.SESSION_DB = 'sessions.sqlite';
    process.env.SESSION_SECRET = 'test-secret-that-is-long-enough-for-validation';
    process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
    // An empty key makes YouTubeService a no-op, so tests never hit the network.
    process.env.YOUTUBE_API_KEY = '';
    fs.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
    return tmp;
}

/**
 * Start the imported Express app on an ephemeral port.
 * `app.ready()` runs migrations first — the server must not accept a request before
 * the schema exists.
 */
async function startServer(app) {
    await app.ready();
    return new Promise((resolve) => {
        const server = app.listen(0, () => {
            const { port } = server.address();
            resolve({ server, baseURL: `http://127.0.0.1:${port}` });
        });
    });
}

/** Minimal cookie jar + CSRF handling so a logged-in session persists across requests. */
class Client {
    constructor(baseURL) {
        this.baseURL = baseURL;
        this.cookie = '';
        this.csrfToken = null;
    }

    /**
     * Fetch (and cache) a CSRF token. The token lives in the session, so one token is
     * valid for every subsequent mutation by this client — but it must be re-read
     * after login, because starting a session regenerates it.
     */
    async token({ force = false } = {}) {
        if (this.csrfToken && !force) return this.csrfToken;
        // An authenticated client is redirected away from /login, but every page's
        // navbar renders the logout form (which carries a token). Try both.
        for (const path of ['/login', '/']) {
            const html = await (await this.get(path)).text();
            const match = /name="_csrf" value="([^"]+)"/.exec(html);
            if (match) {
                this.csrfToken = match[1];
                return this.csrfToken;
            }
        }
        this.csrfToken = null;
        return null;
    }

    async request(method, urlPath, { body, form, raw, headers: extraHeaders } = {}) {
        const headers = { ...extraHeaders };
        if (this.cookie) headers.Cookie = this.cookie;

        let payload;
        if (form) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            payload = new URLSearchParams(form).toString();
        } else if (body) {
            headers['Content-Type'] = 'application/json';
            payload = JSON.stringify(body);
        } else if (raw) {
            payload = raw.body;
            Object.assign(headers, raw.headers);
        }

        const res = await fetch(this.baseURL + urlPath, {
            method,
            headers,
            body: payload,
            redirect: 'manual'
        });

        const setCookie = res.headers.get('set-cookie');
        if (setCookie) this.cookie = setCookie.split(';')[0];
        return res;
    }

    get(p, opts) {
        return this.request('GET', p, opts);
    }

    /** POST with the CSRF token attached automatically. */
    async post(p, opts = {}) {
        const token = await this.token();
        if (opts.form) opts = { ...opts, form: { ...opts.form, _csrf: token } };
        else opts = { ...opts, headers: { ...opts.headers, 'X-CSRF-Token': token } };
        return this.request('POST', p, opts);
    }

    /** POST deliberately WITHOUT a CSRF token, for negative tests. */
    postWithoutCsrf(p, opts) {
        return this.request('POST', p, opts);
    }

    /** Register and log in, returning this client for chaining. */
    async registerAs(email, password = 'test-password-123') {
        await this.post('/register', {
            form: { username: email, password, firstName: 'Test', lastName: 'User' }
        });
        // The session (and therefore the CSRF token) was regenerated on login.
        await this.token({ force: true });
        return this;
    }
}

/** Build a multipart body without pulling in a form-data dependency. */
function multipart({ fieldName = 'mp3file', filename, contentType, content, fields = {} }) {
    const boundary = `----musichubtest${Date.now()}`;
    const chunks = [];
    for (const [name, value] of Object.entries(fields)) {
        chunks.push(
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
            )
        );
    }
    chunks.push(
        Buffer.from(
            `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
                `Content-Type: ${contentType}\r\n\r\n`
        )
    );
    chunks.push(Buffer.isBuffer(content) ? content : Buffer.from(content));
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    return {
        body: Buffer.concat(chunks),
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }
    };
}

/** Minimal but genuinely valid MP3 bytes: an ID3v2 header plus one MPEG frame. */
function validMp3Bytes() {
    const id3 = Buffer.from([
        0x49,
        0x44,
        0x33,
        0x03,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x0a,
        ...new Array(10).fill(0)
    ]);
    // 0xFF 0xFB = MPEG-1 Layer III frame sync.
    const frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(400)]);
    return Buffer.concat([id3, frame]);
}

module.exports = { configureTestEnv, startServer, Client, multipart, validMp3Bytes };
