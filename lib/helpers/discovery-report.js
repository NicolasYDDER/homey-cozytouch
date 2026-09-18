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

module.exports = {
  discoveredDeviceName,
  describeDiscoveredDevice,
  describeDiscoveredDevices,
  MAX_LISTED,
};
