'use strict';

/**
 * Human-readable summary of the devices discovery returned, used when pairing
 * finds an account full of devices but none this driver supports.
 *
 * Without it the user only sees "no compatible device found" and the app log
 * only says the same, so a support report cannot tell which product was
 * missing. Naming each device with the identifier support is keyed on
 * (Magellan modelId, Overkiz controllableName) makes the report actionable —
 * that is how the Calypso connecté (modelId 1658) stayed unpairable through
 * issue #5.
 */

const MAX_LISTED = 8;

// An Overkiz device carries far fewer states than a Magellan device carries
// capabilities, but a Pass APC stack has a dozen devices — so the cap is per
// device and the report stays readable.
const MAX_STATES = 40;
const MAX_VALUE_CHARS = 32;

/**
 * What the device calls itself, with no identifiers — for a sentence where the
 * user has to recognize their own device rather than report it.
 * @returns {string|null}
 */
function discoveredDeviceName(dev) {
  if (!dev) return null;
  if (dev._protocol === 'overkiz') {
    return String(dev.label || dev.name || dev.deviceURL || 'unknown');
  }
  return String(dev.name || (dev.deviceId ? `device ${dev.deviceId}` : 'unknown'));
}

function describeDiscoveredDevice(dev) {
  const name = discoveredDeviceName(dev);
  if (!name) return null;

  if (dev._protocol === 'overkiz') {
    const kind = dev.controllableName || dev.widget || dev.uiClass;
    return kind ? `${name} (${kind})` : name;
  }

  if (!dev.modelId) return name;
  // productId when the device carries it: capability IDs are per product, so a
  // screenshot of this list is only actionable with both halves of the key.
  const ids = dev.productId ? `modelId ${dev.modelId} / productId ${dev.productId}` : `modelId ${dev.modelId}`;
  return `${name} (${ids})`;
}

/**
 * @param {object[]} devices - devices tagged with `_protocol` by discovery
 * @returns {string} comma-separated list, empty when there is nothing to report
 */
function describeDiscoveredDevices(devices, max = MAX_LISTED) {
  const described = (devices || []).map(describeDiscoveredDevice).filter(Boolean);
  if (described.length === 0) return '';
  if (described.length <= max) return described.join(', ');
  return `${described.slice(0, max).join(', ')}, +${described.length - max}`;
}

/**
 * Same job as magellan-capabilities' formatValue: keep one state on one line.
 * Duplicated rather than shared because the two reports have no other reason to
 * know about each other.
 */
function formatStateValue(value) {
  if (value === null || value === undefined) return '-';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

/**
 * Paste-ready dump of every device an account announced over Overkiz.
 *
 * The Magellan half of Test Connection has had this since 1.4.9; the Overkiz
 * half listed only label, uiClass and type. `controllableName` is the identifier
 * Overkiz support is keyed on — `io:AtlanticPassAPCHeatingZoneComponent` and a
 * plain `io:AtlanticElectricalHeaterIOComponent` are both uiClass
 * `HeatingSystem` — so without it an account whose devices all sit on Overkiz
 * could not be triaged from a report at all. An Alféa Extensa Duo owner sent
 * one showing twelve Overkiz devices and not one identifiable line.
 *
 * States are included for the same reason the Magellan dump includes values:
 * which `core:`/`io:` states a product answers on is exactly what mapping it
 * needs, and they are already in the setup payload.
 *
 * @param {object[]} devices - devices as /setup returns them
 * @param {function(object): string} typeOf - OverkizAPI.getDeviceType
 * @param {string} [appVersion]
 */
function describeOverkizAccount(devices, typeOf, appVersion) {
  const list = Array.isArray(devices) ? devices : [];
  const header = `Overkiz — ${list.length} device(s)`;
  const lines = [appVersion ? `${header} — app ${appVersion}` : header];

  for (const dev of list) {
    const type = typeof typeOf === 'function' ? typeOf(dev) : '?';
    lines.push('');
    lines.push(`${dev.label || '(unnamed)'} | ${dev.controllableName || '(no controllableName)'} | uiClass ${dev.uiClass || '?'} | widget ${dev.widget || '?'} | type ${type}`);
    lines.push(`  ${dev.deviceURL || '(no deviceURL)'}`);

    const states = Array.isArray(dev.states) ? dev.states : [];
    if (states.length === 0) {
      lines.push('  (no states)');
      continue;
    }
    const described = states.slice(0, MAX_STATES)
      .map((s) => `${s && s.name ? s.name : '?'}=${formatStateValue(s && s.value)}`);
    if (states.length > MAX_STATES) described.push(`+${states.length - MAX_STATES}`);
    lines.push(`  ${described.join(', ')}`);
  }
  return lines.join('\n');
}

module.exports = {
  discoveredDeviceName,
  describeDiscoveredDevice,
  describeDiscoveredDevices,
  describeOverkizAccount,
  MAX_LISTED,
  MAX_STATES,
};
