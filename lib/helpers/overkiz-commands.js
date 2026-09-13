'use strict';

/**
 * Which commands an Overkiz device actually accepts.
 *
 * The Atlantic range keeps the same protocol family across products but not the
 * same command names: one Pass APC heat pump takes setHeatingTargetTemperature
 * where another only advertises setDerogatedTargetTemperature, and a heating-only
 * unit has no setHeatingCoolingAutoSwitch at all. The Overkiz /setup payload
 * lists what each endpoint accepts (`definition.commands`), so the names are
 * read from the device instead of guessed per model — which is what made support
 * for a new product need a user log dump every time (issues #5, #9).
 *
 * The list is snapshotted into the Homey device store at pairing time.
 */

/** @returns {string[]} command names the device advertises, empty when unknown */
function supportedCommandNames(device) {
  const commands = (device && device.definition && device.definition.commands) || [];
  return commands
    .map((command) => (typeof command === 'string' ? command : command.commandName || command.name))
    .filter(Boolean);
}

/**
 * First candidate the device advertises.
 *
 * @param {string[]} supported - from supportedCommandNames(), via the store
 * @param {string[]} candidates - accepted names, most specific first
 * @returns {string|null} the name to send, the first candidate when the device
 *   advertised nothing (devices paired before this was stored), or null when it
 *   does advertise commands and none of ours is among them.
 */
function pickCommand(supported, candidates) {
  if (!Array.isArray(supported) || supported.length === 0) {
    return candidates[0] || null;
  }
  return candidates.find((candidate) => supported.includes(candidate)) || null;
}

module.exports = {
  supportedCommandNames,
  pickCommand,
};
