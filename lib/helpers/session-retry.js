'use strict';

/**
 * Whether an error means "the session this app is holding is no longer valid",
 * as opposed to a request that failed on its own merits.
 *
 * Both APIs answer 401 for it and both set `statusCode` on the error they throw
 * (CozyTouchAPI._request, OverkizAPI._overkizGet). The message is matched too
 * because an error that has crossed a translation layer keeps its text and loses
 * its fields — CozyTouchDevice._writeMagellanCapability rebuilds one that way.
 *
 *   Magellan: API request failed: 401 {"code":"900901","message":"Invalid Credentials"}
 *   Overkiz:  Overkiz API 401: {"errorCode":"RESOURCE_ACCESS_DENIED","error":"Not authenticated"}
 */
function isSessionExpiredError(err) {
  if (!err) return false;
  if (err.statusCode === 401) return true;
  return /\b401\b/.test(err.message || '');
}

/**
 * Run `read` against an authenticated API, logging in again if the session turns
 * out to be dead.
 *
 * `isAuthenticated()` on both APIs reports only that a token was obtained at
 * some point, never that it is still valid: CozyTouchAPI.authenticate() throws
 * away the `expires_in` it is given, and a Cozytouch token lives about eight
 * hours. On a Homey with paired devices the poll cycle renews it on the way past
 * (CozyTouchDevice._handlePollError), but nothing renews it on a Homey with no
 * paired device at all — so a user who installed the app and went to add a
 * device the next day reached discovery holding a 38-hour-old token, was refused
 * by both protocols, and was told the account had no devices on it. It had
 * thirteen, as the same app showed ninety seconds later.
 *
 * The dead session is dropped explicitly rather than just re-authenticated over:
 * the app caches one API instance per account and hands the same one back for as
 * long as it claims to be authenticated (CozyTouchApp.getCozyTouchApi), so an
 * instance whose token is dead but present is handed out forever.
 */
async function withFreshSession(api, read, log = () => {}) {
  try {
    if (!api.isAuthenticated()) await api.authenticate();
    return await read();
  } catch (err) {
    if (!isSessionExpiredError(err)) throw err;
    log('Session had expired; logging in again');
    api.invalidateSession();
    await api.authenticate();
    return read();
  }
}

module.exports = { isSessionExpiredError, withFreshSession };
