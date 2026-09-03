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

/**
 * Capability IDs are per *product*, not per model family. The AQUEO ACI HYB
 * (productId 7 — modelId 389 «VS 300L 3000M» and 390 «VM 150L 2200M») answers
 * on a newer block entirely: none of the IDs above exist on it, which is why
 * such a tank showed no value and refused every command (issue #9).
 *
 * `null` means the product has no such capability: this tank has no on/off at
 * all (it is always on, its mode is what drives it), and away mode is a switch
 * on 227 — capability 10 does not exist in the API for any product.
 *
 * Mapped from the capability list the device reports, against the table of the
 * Home Assistant integration this app already credits
 * (gduteil/cozytouch — `capability.py`, `model.py`), which names modelId 390.
 */
const WATER_HEATER_CAP_IDS_BY_PRODUCT = {
  7: {
    HEATING_MODE: 87, // select, same values as cap 1: 0=manual, 3=eco+, 4=prog
    TARGET_TEMP: 231,
    TARGET_TEMP_ALT: 22, // target_temperature_dhw, mirrors 231 on this tank
    ON_OFF: null,
    BOOST: 165,
    ECO: null,
    CURRENT_TEMP: 266, // tank top temperature (265 middle, 267 bottom)
    AWAY_MODE: 227, // 0=off, 1=on, 2=booked but not started
    MIN_TEMP: 105301,
    MAX_TEMP: 105304,
  },
};

/**
 * Capability IDs for a Magellan tank, specialized for its product when known.
 * @param {number|string} [productId] - `productId` from the device store
 */
function waterHeaterCapIds(productId) {
  const override = WATER_HEATER_CAP_IDS_BY_PRODUCT[productId];
  return override ? { ...WATER_HEATER_CAP_IDS, ...override } : { ...WATER_HEATER_CAP_IDS };
}

// Towel racks use HVAC mode (cap 7): 0=off, 4=heat.
// Preset is controlled via PROG_MODE (cap 184): 0=manual, 1=prog.
const TOWEL_RACK_CAP_IDS = {
  HVAC_MODE: 7,
  TARGET_TEMP: 40,
  CURRENT_TEMP: 117,
  MODE_STATUS: 164,
  BOOST: 165,
  ECO_TEMP: 172,
  PROG_MODE: 184,
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

// ── Towel rack HVAC mode maps ───────────────────────────────────
// Cap 7 (HVAC mode): 0=off, 4=heat. Cap 184 (preset): 0=manual, 1=prog.
// Cap 164 (read-only status): 0=off, 1=manual, 2=prog.

const TOWEL_RACK_HVAC_TO_API = { off: '0', heat: '4' };
const API_TO_TOWEL_RACK_MODE = { 0: 'off', 1: 'manual', 2: 'prog' };

// ── Climate fan/swing maps ───────────────────────────────────────

const FAN_MODE_TO_API = { auto: '0', low: '1', medium: '2', high: '3' };
const API_TO_FAN_MODE = { 0: 'auto', 1: 'low', 2: 'medium', 3: 'high' };

const SWING_MODE_TO_API = { up: '0', middle_up: '1', middle_down: '2', down: '3' };
const API_TO_SWING_MODE = { 0: 'up', 1: 'middle_up', 2: 'middle_down', 3: 'down' };

module.exports = {
  HEATER_CAP_IDS,
  WATER_HEATER_CAP_IDS,
  WATER_HEATER_CAP_IDS_BY_PRODUCT,
  waterHeaterCapIds,
  TOWEL_RACK_CAP_IDS,
  CLIMATE_CAP_IDS,
  HEATER_MODE_TO_API,
  API_TO_HEATER_MODE,
  TOWEL_RACK_HVAC_TO_API,
  API_TO_TOWEL_RACK_MODE,
  FAN_MODE_TO_API,
  API_TO_FAN_MODE,
  SWING_MODE_TO_API,
  API_TO_SWING_MODE,
};
