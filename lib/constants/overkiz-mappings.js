'use strict';

const OverkizAPI = require('../OverkizAPI');

// Re-export core constants from OverkizAPI for handler convenience
const { STATES, COMMANDS } = OverkizAPI;

// ── Heating level maps (heater + towel_rack) ─────────────────────

const OVERKIZ_LEVEL_TO_MODE = {
  off: 'off',
  comfort: 'manual',
  eco: 'eco_plus',
  frostprotection: 'off',
};

const MODE_TO_OVERKIZ_LEVEL = {
  off: 'off',
  manual: 'comfort',
  eco_plus: 'eco',
  prog: 'comfort',
};

// ── Pass Cozytouch heating levels ────────────────────────────────
// Homey capability cozytouch_pass_level mirrors Overkiz values 1:1

const PASS_COZYTOUCH_LEVELS = [
  'off',
  'frostprotection',
  'eco',
  'comfort-2',
  'comfort-1',
  'comfort',
];

// Adjustable-setpoint radiators (Ipala) ─────────────────────────
// Write commands must use IO-accepted params (basic/standby/internal).
// `manual`/`off`/`prog` appear in definitions but are rejected by the
// IO driver on this hardware (same issue as HA Overkiz).

const ADJUSTABLE_SETPOINT_OPERATING_TO_MODE = {
  standby: 'off',
  off: 'off',
  antifreeze: 'off',
  frostprotection: 'off',
  away: 'off',
  basic: 'manual',
  manual: 'manual',
  normal: 'manual',
  on: 'manual',
  max: 'manual',
  boost: 'manual',
  eco: 'eco_plus',
  internal: 'prog',
  external: 'prog',
  prog: 'prog',
  program: 'prog',
  auto: 'prog',
};

const MODE_TO_ADJUSTABLE_SETPOINT = {
  off: { command: 'setOperatingMode', value: 'standby' },
  manual: { command: 'setOperatingMode', value: 'basic' },
  eco_plus: { command: 'setHeatingLevel', value: 'eco' },
  prog: { command: 'setOperatingMode', value: 'internal' },
};

// ── DHW mode maps (water_heater only) ────────────────────────────

const OVERKIZ_DHW_TO_MODE = {
  manualEcoActive: 'eco_plus',
  manualEcoInactive: 'manual',
  autoMode: 'auto',
  boost: 'manual',
};

const MODE_TO_OVERKIZ_DHW = {
  manual: 'manualEcoInactive',
  eco_plus: 'manualEcoActive',
  auto: 'autoMode',
};

// ── Pass APC zone controller (Shogun Zone Control 2.0) ───────────

const PASS_APC_OPERATING_TO_HVAC = {
  heating: 'heat',
  cooling: 'cool',
  drying: 'dry',
  stop: 'off',
};

const HVAC_TO_PASS_APC_OPERATING = {
  heat: 'heating',
  cool: 'cooling',
  dry: 'drying',
  off: 'stop',
};

const PASS_APC_ZONE_MODE_TO_OVERKIZ = {
  off: 'stop',
  manual: 'manu',
  prog: 'internalScheduling',
};

const PASS_APC_OVERKIZ_TO_ZONE_MODE = {
  stop: 'off',
  manu: 'manual',
  internalScheduling: 'prog',
  externalScheduling: 'prog',
  auto: 'prog',
  comfort: 'manual',
  eco: 'manual',
  absence: 'off',
};

const PASS_APC_STATES = {
  OPERATING_MODE: 'io:PassAPCOperatingModeState',
  LAST_OPERATING_MODE: 'io:LastPassAPCOperatingModeState',
  AUTO_SWITCH: 'core:HeatingCoolingAutoSwitchState',
  HEATING_ON_OFF: 'core:HeatingOnOffState',
  COOLING_ON_OFF: 'core:CoolingOnOffState',
  HEATING_TARGET_TEMP: 'core:HeatingTargetTemperatureState',
  COOLING_TARGET_TEMP: 'core:CoolingTargetTemperatureState',
  TARGET_TEMP: 'core:TargetTemperatureState',
  MIN_HEATING_TARGET_TEMP: 'core:MinimumHeatingTargetTemperatureState',
  MAX_HEATING_TARGET_TEMP: 'core:MaximumHeatingTargetTemperatureState',
  MIN_COOLING_TARGET_TEMP: 'core:MinimumCoolingTargetTemperatureState',
  MAX_COOLING_TARGET_TEMP: 'core:MaximumCoolingTargetTemperatureState',
  HEATING_MODE: 'io:PassAPCHeatingModeState',
  COOLING_MODE: 'io:PassAPCCoolingModeState',
  DEROGATION_ON_OFF: 'core:DerogationOnOffState',
};

const PASS_APC_COMMANDS = {
  SET_OPERATING_MODE: 'setPassAPCOperatingMode',
  SET_AUTO_SWITCH: 'setHeatingCoolingAutoSwitch',
  SET_HEATING_TARGET_TEMP: 'setHeatingTargetTemperature',
  SET_COOLING_TARGET_TEMP: 'setCoolingTargetTemperature',
  SET_HEATING_ON_OFF: 'setHeatingOnOffState',
  SET_COOLING_ON_OFF: 'setCoolingOnOffState',
  SET_HEATING_MODE: 'setPassAPCHeatingMode',
  SET_COOLING_MODE: 'setPassAPCCoolingMode',
  SET_DEROGATION_ON_OFF: 'setDerogationOnOffState',
};

// ── Extra commands not in OverkizAPI.COMMANDS ─────────────────────

const EXTRA_COMMANDS = {
  SET_TARGET_TEMPERATURE: 'setTargetTemperature',
  SET_OPERATING_MODE: 'setOperatingMode',
};

// ── Helper: read state value from array ──────────────────────────

function getStateValue(states, stateName) {
  const state = (states || []).find((s) => s.name === stateName);
  return state ? state.value : null;
}

module.exports = {
  STATES,
  COMMANDS,
  EXTRA_COMMANDS,
  OVERKIZ_LEVEL_TO_MODE,
  MODE_TO_OVERKIZ_LEVEL,
  PASS_COZYTOUCH_LEVELS,
  ADJUSTABLE_SETPOINT_OPERATING_TO_MODE,
  MODE_TO_ADJUSTABLE_SETPOINT,
  OVERKIZ_DHW_TO_MODE,
  MODE_TO_OVERKIZ_DHW,
  PASS_APC_OPERATING_TO_HVAC,
  HVAC_TO_PASS_APC_OPERATING,
  PASS_APC_ZONE_MODE_TO_OVERKIZ,
  PASS_APC_OVERKIZ_TO_ZONE_MODE,
  PASS_APC_STATES,
  PASS_APC_COMMANDS,
  getStateValue,
};
