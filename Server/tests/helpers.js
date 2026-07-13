// author: claude
const os = require('os');
const path = require('path');
const fs = require('fs');

// Configure a throwaway environment BEFORE the app (and db.js) are required.
function configureTestEnv() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'musichub-test-'));
    process.env.NODE_ENV = 'test';
    process.env.DB_PATH = path.join(tmp, 'test.sqlite');
    process.env.SESSION_DIR = tmp;
    process.env.SESSION_DB = 'sessions.sqlite';
    process.env.SESSION_SECRET = 'test-secret';
    // Empty key makes the YouTube search helper a no-op, so tests never hit the network.
    process.env.YOUTUBE_API_KEY = '';
    return tmp;
}

// Start the imported Express app on an ephemeral port and return its base URL.
function startServer(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, () => {
            const { port } = server.address();
            resolve({ server, baseURL: `http://127.0.0.1:${port}` });
        });
    });
}

// Minimal cookie jar so a logged-in session persists across requests.
class Client {
    constructor(baseURL) {
        this.baseURL = baseURL;
        this.cookie = '';
    }

    async request(method, urlPath, { body, form } = {}) {
        const headers = {};
        if (this.cookie) headers['Cookie'] = this.cookie;
        let payload;
        if (form) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            payload = new URLSearchParams(form).toString();
        } else if (body) {
            headers['Content-Type'] = 'application/json';
            payload = JSON.stringify(body);
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

    get(p, opts) { return this.request('GET', p, opts); }
    post(p, opts) { return this.request('POST', p, opts); }
}

module.exports = { configureTestEnv, startServer, Client };
