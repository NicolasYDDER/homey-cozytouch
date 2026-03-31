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

// ── Extra commands not in OverkizAPI.COMMANDS ─────────────────────

const EXTRA_COMMANDS = {
  SET_TARGET_TEMPERATURE: 'setTargetTemperature',
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
  OVERKIZ_DHW_TO_MODE,
  MODE_TO_OVERKIZ_DHW,
  getStateValue,
};
