const test = require('node:test');
const assert = require('node:assert/strict');
const { getAppCallbackUrl } = require('./auth.controller');

const allowedCallbacks = [
    'http://localhost:8081/auth/callback',
    'https://linkerin.toopsy.app/auth/callback'
];

test('allows OAuth callback parameters on a configured web callback URL', () => {
    const callback = 'http://localhost:8081/auth/callback?embedded=1&authChannel=123';

    assert.equal(getAppCallbackUrl(callback, '/auth/callback', allowedCallbacks), callback);
});

test('allows authentication response parameters on the production web callback', () => {
    const callback = 'https://linkerin.toopsy.app/auth/callback?token=example-token';

    assert.equal(getAppCallbackUrl(callback, '/auth/callback', allowedCallbacks), callback);
});

test('rejects unconfigured origins and callback paths', () => {
    const fallback = 'linkerin://auth/callback';

    assert.equal(getAppCallbackUrl('http://localhost:8082/auth/callback?embedded=1', '/auth/callback', allowedCallbacks), fallback);
    assert.equal(getAppCallbackUrl('http://localhost:8081/other?embedded=1', '/auth/callback', allowedCallbacks), fallback);
});

test('allows Chrome extension identity callbacks only on the Google login callback', () => {
    const callback = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/auth/callback';

    assert.equal(getAppCallbackUrl(callback, '/auth/callback', allowedCallbacks), callback);
    assert.equal(getAppCallbackUrl(callback, '/auth/gmail-callback', allowedCallbacks), 'linkerin://auth/gmail-callback');
});

test('rejects malformed Chrome extension callback hosts', () => {
    const fallback = 'linkerin://auth/callback';

    assert.equal(
        getAppCallbackUrl('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org.evil.test/auth/callback', '/auth/callback', allowedCallbacks),
        fallback
    );
    assert.equal(
        getAppCallbackUrl('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/other', '/auth/callback', allowedCallbacks),
        fallback
    );
});
