'use strict';

/**
 * Values just sent to a device, kept while the cloud catches up.
 *
 * After a command the Overkiz cloud goes on answering with the state from before
 * it for up to a minute: an Ipala switched off at 22:26:28 read back as "manual"
 * at 22:26:33 and as "off" again at 22:27:33. Shown as they came, those reads put
 * the tiles back to the old value and fired the "heating mode changed" Flow
 * trigger for a change that never happened.
 *
 * A read that disagrees with a command still inside its settling time is left
 * out; one that agrees ends the wait; and once the time is up the device is
 * believed again, so a command the radiator refused does not stay on screen.
 */

const SETTLE_MS = 2 * 60 * 1000;

class PendingWrites {

  constructor({ settleMs = SETTLE_MS, now = Date.now } = {}) {
    this._settleMs = settleMs;
    this._now = now;
    this._pending = new Map();
  }

  /** `value` was just sent for capability `name`. */
  expect(name, value) {
    this._pending.set(name, { value, until: this._now() + this._settleMs });
  }

  /**
   * Whether a value read from the device may replace what the tile shows.
   * @returns {boolean}
   */
  accepts(name, value) {
    const pending = this._pending.get(name);
    if (!pending) return true;

    if (value === pending.value || this._now() >= pending.until) {
      this._pending.delete(name);
      return true;
    }
    return false;
  }

}

module.exports = { PendingWrites, SETTLE_MS };
