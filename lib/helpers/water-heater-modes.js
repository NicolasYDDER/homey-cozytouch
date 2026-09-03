'use strict';

/**
 * Heating modes a water heater accepts, and how to resolve a mode coming from
 * the shared "Set heating mode" Flow card — whose dropdown lists every mode
 * across the heating drivers, including modes a tank has no command for.
 */

const BASE_MODES = ['off', 'manual', 'eco_plus'];

/**
 * @param {object} device
 * @param {string} [device.protocol] - 'cozytouch' (Magellan) or 'overkiz'
 * @param {boolean} [device.isMbl] - MBL tanks (Atlantic Égéo) have no separate
 *   auto mode on the device side: autoMode is how their "eco" is represented.
 * @param {boolean} [device.hasOnOff] - false on Magellan products with no on/off
 *   capability (AQUEO ACI HYB): they are always on and driven by their mode, so
 *   offering Off would only produce a command the device refuses.
 */
function supportedWaterHeaterModes({ protocol = 'overkiz', isMbl = false, hasOnOff = true } = {}) {
  const base = hasOnOff ? BASE_MODES : BASE_MODES.filter((mode) => mode !== 'off');
  // Magellan tanks (Calypso connecté) drive the mode through capability 1:
  // 0=manual, 3=eco+, 4=prog. No auto value exists, but prog does — the
  // opposite of the Overkiz tanks.
  if (protocol === 'cozytouch') {
    return [...base, 'prog'];
  }
  return isMbl ? [...base] : [...base, 'auto'];
}

/**
 * @param {string} mode - mode asked for, from the Flow card or the tile
 * @param {string[]} supported - result of supportedWaterHeaterModes()
 * @param {boolean} [autoAliasesToEco] - true on MBL tanks only, where Auto and
 *   Eco are the same device mode (autoMode)
 * @returns {string|null} the mode to send, or null when the tank cannot do it.
 */
function resolveWaterHeaterMode(mode, supported, autoAliasesToEco = false) {
  if (supported.includes(mode)) {
    return mode;
  }
  if (autoAliasesToEco && mode === 'auto' && supported.includes('eco_plus')) {
    return 'eco_plus';
  }
  return null;
}

module.exports = {
  supportedWaterHeaterModes,
  resolveWaterHeaterMode,
};
