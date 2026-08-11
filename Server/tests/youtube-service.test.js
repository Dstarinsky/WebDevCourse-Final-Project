const test = require('node:test');
const assert = require('node:assert/strict');
const { configureTestEnv } = require('./helpers');

configureTestEnv();
process.env.YOUTUBE_API_KEY = 'test-api-key';
process.env.YOUTUBE_TIMEOUT_MS = '25';

const config = require('../config');
const YouTubeService = require('../services/YouTubeService');
const { YouTubeUnavailableError } = require('../services/YouTubeService');
const { ValidationError } = require('../errors');

const originalFetch = global.fetch;

test.afterEach(() => {
    global.fetch = originalFetch;
    YouTubeService.clearCache();
});

test('YouTube search validates input before making a request', async () => {
    global.fetch = async () => {
        throw new Error('fetch must not run');
    };
    await assert.rejects(YouTubeService.search('   '), ValidationError);
    await assert.rejects(
        YouTubeService.search('x'.repeat(config.youtube.maxQueryLength + 1)),
        ValidationError
    );
});

test('YouTube search builds a bounded request and validates response items', async () => {
    let requestedUrl;
    let requestedOptions;
    global.fetch = async (url, options) => {
        requestedUrl = new URL(url);
        requestedOptions = options;
        return new Response(
            JSON.stringify({
                items: [
                    {
                        id: { videoId: 'dQw4w9WgXcQ' },
                        snippet: {
                            title: 'A valid result',
                            thumbnails: {
                                medium: { url: 'https://i.ytimg.com/vi/x/mqdefault.jpg' }
                            }
                        }
                    },
                    { id: { videoId: 'bad' }, snippet: { title: 'Discard me' } }
                ]
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
        );
    };

    const results = await YouTubeService.search('  jazz  ', 999);
    assert.equal(results.length, 1);
    assert.equal(results[0].videoId, 'dQw4w9WgXcQ');
    assert.equal(requestedUrl.searchParams.get('q'), 'jazz');
    assert.equal(requestedUrl.searchParams.get('maxResults'), String(config.youtube.maxResults));
    assert.equal(requestedUrl.searchParams.get('key'), 'test-api-key');
    assert.ok(requestedOptions.signal instanceof AbortSignal);
});

test('successful repeated searches use the bounded short-lived cache', async () => {
    let calls = 0;
    global.fetch = async () => {
        calls += 1;
        return new Response(
            JSON.stringify({
                items: [
                    {
                        id: { videoId: 'dQw4w9WgXcQ' },
                        snippet: { title: 'Cached', thumbnails: {} }
                    }
                ]
            }),
            { status: 200 }
        );
    };

    const first = await YouTubeService.search('cache me');
    first[0].title = 'caller mutation';
    const second = await YouTubeService.search('CACHE ME');
    assert.equal(calls, 1);
    assert.equal(second[0].title, 'Cached', 'cache entries must not be mutable by callers');
});

test('an empty upstream result is distinct from an upstream failure', async () => {
    global.fetch = async () => new Response(JSON.stringify({ items: [] }), { status: 200 });
    assert.deepEqual(await YouTubeService.search('nothing'), []);

    for (const status of [400, 403, 500]) {
        YouTubeService.clearCache();
        global.fetch = async () => new Response('upstream error', { status });
        await assert.rejects(YouTubeService.search(`failure ${status}`), YouTubeUnavailableError);
    }
});

test('invalid JSON, invalid response shape, and timeouts fail safely', async () => {
    global.fetch = async () => new Response('{', { status: 200 });
    await assert.rejects(YouTubeService.search('bad json'), YouTubeUnavailableError);

    global.fetch = async () => new Response(JSON.stringify({ nope: [] }), { status: 200 });
    await assert.rejects(YouTubeService.search('bad shape'), YouTubeUnavailableError);

    global.fetch = async () => {
        throw new DOMException('timed out', 'TimeoutError');
    };
    await assert.rejects(YouTubeService.search('timeout'), YouTubeUnavailableError);
});
