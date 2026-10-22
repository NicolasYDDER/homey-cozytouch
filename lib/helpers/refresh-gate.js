'use strict';

/**
 * Pace for the Overkiz "refresh states" request.
 *
 * Overkiz limits how often the devices may be asked to report again, and answers
 * HTTP 429 / QUOTA_EXCEEDED once that is exceeded. One account got that answer
 * to every sync for an hour and a half: a request a minute, none accepted, one
 * error line each, and the official Cozytouch app competing for the same quota.
 *
 * After a refusal the request is therefore skipped for a while, longer each time
 * it is refused again, and tried normally once it is accepted. The sync cycle
 * keeps reading the devices in the meantime — only the request to refresh them
 * is held back.
 */

const FIRST_WAIT_MS = 2 * 60 * 1000;
const MAX_WAIT_MS = 15 * 60 * 1000;

function isQuotaError(err) {
  return Boolean(err) && err.statusCode === 429;
}

class RefreshGate {

  constructor(now = Date.now) {
    this._now = now;
    // api → { wait, until }; an api that was never refused has no entry
    this._holds = new WeakMap();
  }

  /** Whether the refresh may be asked for now. */
  allows(api) {
    const hold = this._holds.get(api);
    return !hold || this._now() >= hold.until;
  }

  /**
   * The refresh was refused for quota.
   * @returns {number} how long it is skipped, in ms
   */
  refused(api) {
    const previous = this._holds.get(api);
    const waitMs = previous ? Math.min(previous.wait * 2, MAX_WAIT_MS) : FIRST_WAIT_MS;
    this._holds.set(api, { wait: waitMs, until: this._now() + waitMs });
    return waitMs;
  }

  /**
   * The refresh was accepted.
   * @returns {boolean} whether it had been refused before
   */
  accepted(api) {
    return this._holds.delete(api);
  }

}

module.exports = { RefreshGate, isQuotaError, FIRST_WAIT_MS, MAX_WAIT_MS };
