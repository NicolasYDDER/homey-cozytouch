'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { isSessionExpiredError, withFreshSession } = require('../lib/helpers/session-retry');

// The two errors a dead session actually produces, as submitted logs show them.
const magellan401 = () => Object.assign(new Error('API request failed: 401 {"code":"900901","message":"Invalid Credentials","description":"Invalid Credentials. Make sure you have provided the correct security credentials"}'), { statusCode: 401 });
const overkiz401 = () => Object.assign(new Error('Overkiz API 401: {"errorCode":"RESOURCE_ACCESS_DENIED","error":"Not authenticated"}'), { statusCode: 401 });

/**
 * An API instance as this helper uses it. `authenticated` starts true to model
 * the case that caused the bug: the app holds a token it obtained 38 hours ago,
 * so it believes it is logged in while every call is refused.
 */
const fakeApi = ({ authenticated = true, failures = [], authFails = false } = {}) => {
  const api = {
    logins: 0,
    invalidations: 0,
    reads: 0,
    _authenticated: authenticated,
    isAuthenticated: () => api._authenticated,
    authenticate: async () => {
      api.logins += 1;
      if (authFails) throw new Error('Authentication failed: invalid response from Cozytouch API');
      api._authenticated = true;
    },
    invalidateSession: () => {
      api.invalidations += 1;
      api._authenticated = false;
    },
    // Throws the queued errors in order, then succeeds.
    read: async () => {
      api.reads += 1;
      const err = failures.shift();
      if (err) throw err;
      return ['device'];
    },
  };
  return api;
};

describe('isSessionExpiredError', () => {
  it('recognizes the 401 of either protocol', () => {
    assert.equal(isSessionExpiredError(magellan401()), true);
    assert.equal(isSessionExpiredError(overkiz401()), true);
  });

  it('recognizes a 401 that lost its statusCode on the way', () => {
    // A translated error keeps its text and loses its fields.
    assert.equal(isSessionExpiredError(new Error('Overkiz API 401: Not authenticated')), true);
  });

  it('leaves every other failure alone', () => {
    assert.equal(isSessionExpiredError(Object.assign(new Error('API request failed: 404'), { statusCode: 404 })), false);
    assert.equal(isSessionExpiredError(Object.assign(new Error('API request failed: 500'), { statusCode: 500 })), false);
    assert.equal(isSessionExpiredError(new Error('getaddrinfo ENOTFOUND apis.groupe-atlantic.com')), false);
    assert.equal(isSessionExpiredError(null), false);
    assert.equal(isSessionExpiredError(undefined), false);
    assert.equal(isSessionExpiredError({}), false);
  });
});

describe('withFreshSession', () => {
  it('reads straight through when the session is good', async () => {
    const api = fakeApi();
    assert.deepEqual(await withFreshSession(api, api.read), ['device']);
    assert.equal(api.logins, 0, 'logged in again for nothing');
    assert.equal(api.reads, 1);
  });

  it('logs in first when there is no session yet', async () => {
    const api = fakeApi({ authenticated: false });
    await withFreshSession(api, api.read);
    assert.equal(api.logins, 1);
  });

  // The bug: the app held a 38-hour-old token, `isAuthenticated()` said yes
  // because a token exists, and discovery reported an account with thirteen
  // devices as having none.
  it('drops a dead session, logs in again and reads once more', async () => {
    const api = fakeApi({ failures: [magellan401()] });
    const lines = [];

    assert.deepEqual(await withFreshSession(api, api.read, (m) => lines.push(m)), ['device']);
    assert.equal(api.invalidations, 1, 'kept the dead token, so the app hands it out again');
    assert.equal(api.logins, 1);
    assert.equal(api.reads, 2);
    assert.match(lines.join('\n'), /Session had expired/);
  });

  it('retries exactly once, so bad credentials cannot loop', async () => {
    const api = fakeApi({ failures: [overkiz401(), overkiz401()] });
    await assert.rejects(() => withFreshSession(api, api.read), /401/);
    assert.equal(api.reads, 2);
    assert.equal(api.logins, 1);
  });

  it('gives up with the login error when the account itself is refused', async () => {
    const api = fakeApi({ failures: [magellan401()], authFails: true });
    await assert.rejects(() => withFreshSession(api, api.read), /Authentication failed/);
    // Left unauthenticated on purpose: the app builds a fresh instance next time
    // rather than reusing one whose session is known to be dead.
    assert.equal(api.isAuthenticated(), false);
  });

  it('never retries a failure that is not about the session', async () => {
    const boom = Object.assign(new Error('API request failed: 500'), { statusCode: 500 });
    const api = fakeApi({ failures: [boom] });
    await assert.rejects(() => withFreshSession(api, api.read), /500/);
    assert.equal(api.reads, 1, 'retried a failure that a new session cannot fix');
    assert.equal(api.invalidations, 0, 'threw away a session that was fine');
  });

  it('works without a log function', async () => {
    const api = fakeApi({ failures: [magellan401()] });
    assert.deepEqual(await withFreshSession(api, api.read), ['device']);
  });
});
