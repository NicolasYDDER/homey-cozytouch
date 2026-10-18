'use strict';

const { getStateValue } = require('../constants/overkiz-mappings');
const { pickCommand, supportedCommandNames } = require('./overkiz-commands');

/**
 * The hot water tank of a Pass APC heat pump (AtlanticPassAPCDHWComponent) — the
 * tank of an Alféa Duo, driven by the heat pump rather than by a controller of
 * its own.
 *
 * It is not an Overkiz tank like the Calypso, and treating it as one gave it
 * controls it does not have. What an Extensa Duo A.I. 5 R32 reports for it:
 *
 *   io:PassAPCDHWConfigurationState=cumulated
 *   io:PassAPCDHWModeState=peakAndOffPeakScheduling
 *   io:PassAPCDHWProfileState=eco
 *   core:ComfortTargetDHWTemperatureState=52
 *   core:EcoTargetDHWTemperatureState=40
 *   core:TargetDHWTemperatureState=40
 *   core:DHWDerogationAvailabilityState=available
 *   core:BoostOnOffState=off
 *   core:DHWOnOffState=on
 *
 * So: no tank temperature (that is on Magellan, cap 111, if anywhere), no
 * absence state, and a "mode" that names a scheduling type rather than a
 * Manual/Eco/Auto choice. What the tank really has is an on/off switch, a boost,
 * and a setpoint that depends on its profile — TargetDHWTemperatureState is the
 * eco setpoint while the profile is eco (40) and the comfort one (52) otherwise.
 * Home Assistant's Overkiz integration drives it the same way (on/off + boost,
 * eco/comfort setpoint), which is the one public reference for what these tanks
 * accept.
 */

// Accepted command names, most specific first.
const DHW_COMMANDS = {
  SET_ON_OFF: ['setDHWOnOffState'],
  SET_BOOST: ['setBoostOnOffState', 'setBoostMode'],
  SET_ECO_TARGET: ['setEcoTargetDHWTemperature'],
  SET_COMFORT_TARGET: ['setComfortTargetDHWTemperature'],
  // Tried after the profile setter, for a tank that advertises neither.
  SET_TARGET_TEMP: ['setTargetDHWTemperature', 'setWaterTargetTemperature', 'setTargetTemperature'],
  SET_ABSENCE: ['setAbsenceMode', 'setDHWAbsenceMode'],
  // The setters do not update the state the tank publishes; these ask it to.
  REFRESH_ECO_TARGET: 'refreshEcoTargetDHWTemperature',
  REFRESH_COMFORT_TARGET: 'refreshComfortTargetDHWTemperature',
  REFRESH_TARGET: 'refreshTargetDHWTemperature',
};

const DHW_STATES = {
  ON_OFF: ['core:DHWOnOffState'],
  TARGET_TEMP: [
    'core:TargetDHWTemperatureState',
    'core:ComfortTargetDHWTemperatureState',
    'core:WaterTargetTemperatureState',
    'core:TargetTemperatureState',
  ],
  CURRENT_TEMP: [
    'core:DHWTemperatureState',
    'io:MiddleWaterTemperatureState',
    'core:BottomTankWaterTemperatureState',
    'core:TemperatureState',
  ],
  BOOST: ['core:BoostOnOffState', 'io:DHWBoostModeState'],
  ABSENCE: ['core:DHWAbsenceModeState', 'io:DHWAbsenceModeState'],
  MODE: ['io:PassAPCDHWModeState', 'io:DHWModeState', 'core:DHWModeState'],
  PROFILE: ['io:PassAPCDHWProfileState'],
  CONFIGURATION: ['io:PassAPCDHWConfigurationState'],
};

/** First of `names` the tank reports a value for. */
function firstStateValue(states, names) {
  for (const name of names) {
    const value = getStateValue(states, name);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function isOn(value) {
  return value === 'on' || value === true || value === 1 || value === 'prog';
}

/**
 * Which of the tank's two setpoints the setpoint tile stands for right now.
 *
 * The tank keeps a comfort and an eco temperature and publishes the one in force
 * as TargetDHWTemperatureState. Writing the wrong one changes a number the tile
 * is not showing, so the slider appears to snap back: in eco profile (target 40,
 * comfort 52) a write to the comfort setter would never move the tile. Boost
 * always runs at comfort.
 *
 * The profile is what the report shows deciding it. Home Assistant keys off the
 * mode state instead, which on this tank reads a scheduling type, so both are
 * accepted.
 *
 * @returns {'eco'|'comfort'}
 */
function activeSetpoint(states) {
  if (isOn(firstStateValue(states, DHW_STATES.BOOST))) return 'comfort';
  const profile = firstStateValue(states, DHW_STATES.PROFILE);
  const mode = firstStateValue(states, DHW_STATES.MODE);
  return profile === 'eco' || mode === 'eco' ? 'eco' : 'comfort';
}

/**
 * The three states that describe how the tank is scheduled, as one string — what
 * a support report needs, since none of them has a tile.
 * @returns {string|null} null when the tank reports none of them
 */
function describeTankSchedule(states) {
  const mode = firstStateValue(states, DHW_STATES.MODE);
  const profile = firstStateValue(states, DHW_STATES.PROFILE);
  const configuration = firstStateValue(states, DHW_STATES.CONFIGURATION);
  if (mode === null && profile === null && configuration === null) return null;
  return `mode "${mode}", profile "${profile}", configuration "${configuration}"`;
}

/**
 * Whether the tank has an away control this app can drive: it advertises an
 * absence command. The state alone is not enough — a tile that can be read but
 * not written is the inert toggle this exists to prevent.
 *
 * @param {string[]} [commands] - the names the tank advertises
 * @returns {boolean|null} null when the tank advertised no commands at all
 *   (paired before they were stored), which is not the same as "has none" and
 *   must not remove a tile the user already has.
 */
function passApcDhwHasAway(commands) {
  if (!Array.isArray(commands) || commands.length === 0) return null;
  return pickCommand(commands, DHW_COMMANDS.SET_ABSENCE) !== null;
}

/**
 * Capabilities to offer for a Pass APC tank, from what it reports at pairing.
 *
 * measure_temperature only when the tank publishes one: this one does not, and
 * an empty temperature tile on a hot water tank reads as a broken sensor. A tank
 * that reports no states at all is still offered it — it was never judged, only
 * unseen.
 *
 * @param {object} dev - the device as /setup returns it
 * @returns {string[]}
 */
function passApcDhwCapabilities(dev) {
  const states = (dev && dev.states) || [];
  const capabilities = ['target_temperature'];
  if (states.length === 0 || firstStateValue(states, DHW_STATES.CURRENT_TEMP) !== null) {
    capabilities.push('measure_temperature');
  }
  capabilities.push('cozytouch_heating_mode');
  if (passApcDhwHasAway(supportedCommandNames(dev)) === true) {
    capabilities.push('cozytouch_away_mode');
  }
  return capabilities;
}

module.exports = {
  DHW_COMMANDS,
  DHW_STATES,
  firstStateValue,
  isOn,
  activeSetpoint,
  describeTankSchedule,
  passApcDhwHasAway,
  passApcDhwCapabilities,
};
