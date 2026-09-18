'use strict';

/**
 * Which device type (driver) would pair each discovered device.
 *
 * Pairing is per driver, and a user has no way to know which of the seven tiles
 * claims their product. An Alféa Extensa S owner picked "Heat Pump (Alféa / Pass
 * APC)" — the only tile whose name matches their appliance — and got "No
 * compatible devices found in your Cozytouch account" twice before giving up,
 * even though five of their seven endpoints pair on Water Heater, Heat Pump / AC
 * and Towel Rack. That driver is Overkiz-only and their account is Magellan-only,
 * so the message was true of the driver and false of the account.
 *
 * So when a driver finds nothing, ask every other driver what it would take and
 * name it. Devices claimed by two drivers are listed under both: either one
 * works, and picking between them is not this message's job.
 */

const { discoveredDeviceName } = require('./discovery-report');

// A pairing alert is a dialog, so both lists stay short. The full picture goes
// to the app log, where a support report can read it.
const MAX_LISTED = 4;

function listOf(items, max = MAX_LISTED) {
  if (!items || items.length === 0) return '';
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')}, +${items.length - max}`;
}

/**
 * Group discovered devices by the driver that would offer them for pairing.
 *
 * Drivers come out in the order they were passed — the app manifest order, which
 * is the order the Homey "add device" list shows them, so the message walks the
 * same tiles the user is looking at.
 *
 * Device names carry no identifiers here: this is a sentence the user has to
 * recognize their own devices in. `unclaimed` stays as device objects so the
 * caller can name those with their modelId — for those, the identifier *is* the
 * useful part.
 *
 * @param {object[]} devices - devices tagged with `_protocol` by discovery
 * @param {Array<{name: string, claims: function(object): boolean}>} drivers
 * @returns {{claimed: Array<{driver: string, devices: string[]}>, unclaimed: object[]}}
 */
function groupByClaimingDriver(devices, drivers) {
  const discovered = (devices || [])
    .map((dev) => ({ dev, label: discoveredDeviceName(dev) }))
    .filter((entry) => entry.label);

  const claimedAnywhere = new Set();
  const claimed = [];

  for (const driver of drivers || []) {
    if (!driver || !driver.name || typeof driver.claims !== 'function') continue;

    const labels = [];
    for (const { dev, label } of discovered) {
      // A driver that throws on an unexpected device must not hide the others.
      let claims = false;
      try {
        claims = driver.claims(dev) === true;
      } catch {
        claims = false;
      }
      if (!claims) continue;
      labels.push(label);
      claimedAnywhere.add(dev);
    }
    if (labels.length > 0) claimed.push({ driver: driver.name, devices: labels });
  }

  const unclaimed = discovered
    .filter((entry) => !claimedAnywhere.has(entry.dev))
    .map((entry) => entry.dev);

  return { claimed, unclaimed };
}

/**
 * `Water Heater (DHW_0), Towel Rack (TESC_0, TESC_1)` — the device types to try,
 * each with what it would pair.
 *
 * @param {Array<{driver: string, devices: string[]}>} claimed
 * @returns {string} empty when no other driver claims anything
 */
function describeClaimingDrivers(claimed, max = MAX_LISTED) {
  const described = (claimed || [])
    .filter((entry) => entry && entry.driver && entry.devices && entry.devices.length > 0)
    .map((entry) => `${entry.driver} (${listOf(entry.devices, max)})`);
  return listOf(described, max);
}

/**
 * Pick a device's display name out of an i18n manifest value.
 * @param {string|object} value - `"Towel Rack"` or `{ en: …, fr: … }`
 */
function localizedName(value, language) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (language && value[language]) return value[language];
  if (value.en) return value.en;
  const first = Object.values(value).find((text) => typeof text === 'string' && text);
  return first || null;
}

module.exports = {
  groupByClaimingDriver,
  describeClaimingDrivers,
  localizedName,
  listOf,
  MAX_LISTED,
};
