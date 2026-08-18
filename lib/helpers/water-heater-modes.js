'use strict';

/**
 * Heating modes a water heater accepts, and how to resolve a mode coming from
 * the shared "Set heating mode" Flow card — whose dropdown lists every mode
 * across the heating drivers, including modes a tank has no command for.
 */

const BASE_MODES = ['off', 'manual', 'eco_plus'];

/**
 * @param {boolean} isMbl - MBL tanks (Atlantic Égéo) have no separate auto mode
 *   on the device side: autoMode is how their "eco" is represented.
 */
function supportedWaterHeaterModes(isMbl) {
  return isMbl ? [...BASE_MODES] : [...BASE_MODES, 'auto'];
}

/**
 * @returns {string|null} the mode to send, or null when the tank cannot do it.
 */
function resolveWaterHeaterMode(mode, supported) {
  if (supported.includes(mode)) {
    return mode;
  }
  // Auto and Eco are the same device mode on MBL tanks, so alias instead of failing.
  if (mode === 'auto' && supported.includes('eco_plus')) {
    return 'eco_plus';
  }
  return null;
}

module.exports = {
  supportedWaterHeaterModes,
  resolveWaterHeaterMode,
};
