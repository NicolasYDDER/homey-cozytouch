'use strict';

// ── CozyTouch (Magellan) Capability IDs per device type ──────────

const HEATER_CAP_IDS = {
  HEATING_MODE: 1,
  TARGET_TEMP: 2,
  ON_OFF: 3,
  CURRENT_TEMP: 7,
  MIN_TEMP: 160,
  MAX_TEMP: 161,
};

const WATER_HEATER_CAP_IDS = {
  HEATING_MODE: 1,
  TARGET_TEMP: 2,
  ON_OFF: 3,
  BOOST: 5,
  ECO: 6,
  CURRENT_TEMP: 7,
  AWAY_MODE: 10,
  MIN_TEMP: 160,
  MAX_TEMP: 161,
};

// Towel racks have NO separate ON_OFF capability.
// Power is controlled through HEATING_MODE: 0=off, 1=manual.
const TOWEL_RACK_CAP_IDS = {
  HEATING_MODE: 1,
  TARGET_TEMP: 2,
  CURRENT_TEMP: 7,
  MIN_TEMP: 160,
  MAX_TEMP: 161,
};

const CLIMATE_CAP_IDS = {
  HVAC_MODE: 1,
  TARGET_TEMP_HEAT: 2,
  ON_OFF: 3,
  FAN_MODE: 4,
  CURRENT_TEMP: 7,
  TARGET_TEMP_COOL: 8,
  SWING_MODE: 9,
  MIN_TEMP_HEAT: 160,
  MAX_TEMP_HEAT: 161,
  MIN_TEMP_COOL: 162,
  MAX_TEMP_COOL: 163,
};

// ── Heating mode maps (heater + water_heater share these) ────────
// off is handled via separate ON_OFF capability, not via HEATING_MODE.

const HEATER_MODE_TO_API = { off: null, manual: '0', eco_plus: '3', prog: '4' };
const API_TO_HEATER_MODE = { 0: 'manual', 3: 'eco_plus', 4: 'prog' };

// ── Towel rack mode maps (different: no ON_OFF cap) ─────────────
// off='0' is a valid HEATING_MODE value, manual='1'.

const TOWEL_RACK_MODE_TO_API = { off: '0', manual: '1', eco_plus: '3', prog: '4' };
const API_TO_TOWEL_RACK_MODE = { 0: 'off', 1: 'manual', 3: 'eco_plus', 4: 'prog' };

// ── Climate fan/swing maps ───────────────────────────────────────

const FAN_MODE_TO_API = { auto: '0', low: '1', medium: '2', high: '3' };
const API_TO_FAN_MODE = { 0: 'auto', 1: 'low', 2: 'medium', 3: 'high' };

const SWING_MODE_TO_API = { up: '0', middle_up: '1', middle_down: '2', down: '3' };
const API_TO_SWING_MODE = { 0: 'up', 1: 'middle_up', 2: 'middle_down', 3: 'down' };

module.exports = {
  HEATER_CAP_IDS,
  WATER_HEATER_CAP_IDS,
  TOWEL_RACK_CAP_IDS,
  CLIMATE_CAP_IDS,
  HEATER_MODE_TO_API,
  API_TO_HEATER_MODE,
  TOWEL_RACK_MODE_TO_API,
  API_TO_TOWEL_RACK_MODE,
  FAN_MODE_TO_API,
  API_TO_FAN_MODE,
  SWING_MODE_TO_API,
  API_TO_SWING_MODE,
};
