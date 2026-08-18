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

function describeDiscoveredDevice(dev) {
  if (!dev) return null;

  if (dev._protocol === 'overkiz') {
    const name = dev.label || dev.name || dev.deviceURL || 'unknown';
    const kind = dev.controllableName || dev.widget || dev.uiClass;
    return kind ? `${name} (${kind})` : String(name);
  }

  const name = dev.name || (dev.deviceId ? `device ${dev.deviceId}` : 'unknown');
  return dev.modelId ? `${name} (modelId ${dev.modelId})` : String(name);
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
  describeDiscoveredDevice,
  describeDiscoveredDevices,
  MAX_LISTED,
};
