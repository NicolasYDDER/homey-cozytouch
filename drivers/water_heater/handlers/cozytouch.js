'use strict';

const {
  waterHeaterCapIds,
  HEATER_MODE_TO_API,
  API_TO_HEATER_MODE,
} = require('../../../lib/constants/cozytouch-mappings');
const { isCapabilityUnsupportedError } = require('../../../lib/helpers/magellan-capabilities');

// Bounds a domestic hot water setpoint stays within. The limit capabilities of
// an unknown product may hold something else than degrees, and a nonsense range
// would lock the slider: keep the declared range only when it is plausible.
const SETPOINT_FLOOR = 20;
const SETPOINT_CEILING = 90;

/**
 * Cozytouch (Magellan) handler for domestic hot water tanks — e.g. Calypso
 * connecté, whose gateway only answers on Magellan, never on Overkiz.
 *
 * Modes come from the mode capability (0=manual, 3=eco+, 4=prog); there is no
 * auto value, so the driver never offers Auto on this protocol.
 *
 * Which capability IDs carry those values depends on the *product*, not on the
 * model family: see WATER_HEATER_CAP_IDS_BY_PRODUCT. A product without an
 * on/off capability is always on and driven by its mode alone.
 */
class WaterHeaterCozytouchHandler {

  constructor(ctx) {
    this.ctx = ctx;
    const store = (ctx && ctx.store) || {};
    this.caps = waterHeaterCapIds(store.productId);
  }

  async setTargetTemperature(value) {
    const { TARGET_TEMP, TARGET_TEMP_ALT } = this.caps;
    try {
      await this.ctx.setCapValue(TARGET_TEMP, value);
    } catch (err) {
      // The AQUEO family reports the setpoint twice (231 and 22, same value).
      // If the product refuses the first one, write the mirror instead of
      // failing — only a "no such capability" refusal is retried.
      if (!TARGET_TEMP_ALT || !isCapabilityUnsupportedError(err)) throw err;
      this.ctx.log(`Setpoint capability ${TARGET_TEMP} refused; retrying on ${TARGET_TEMP_ALT}`);
      await this.ctx.setCapValue(TARGET_TEMP_ALT, value);
    }
  }

  async setMode(mode) {
    const { ON_OFF, HEATING_MODE } = this.caps;

    if (mode === 'off') {
      // Backstop: the driver leaves Off out of the picker for such a product.
      if (!ON_OFF) {
        throw new Error('This Cozytouch water heater has no off command: it is always on, driven by its mode');
      }
      await this.ctx.setCapValue(ON_OFF, '0');
    } else {
      const apiValue = HEATER_MODE_TO_API[mode];
      // Fail loudly instead of only switching the tank on and leaving it in
      // whatever mode it was: the caller shows the error to the user.
      if (apiValue === null || apiValue === undefined) {
        throw new Error(`Unsupported heating mode for a Cozytouch water heater: ${mode}`);
      }
      if (ON_OFF) await this._switchOn(ON_OFF);
      await this.ctx.setCapValue(HEATING_MODE, apiValue);
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
  }

  // Even a product whose on/off capability is mapped may answer "no
  // implementation" for it (that is how the AQUEO was first seen). On such a
  // tank the mode is what runs it, so failing here would only leave the mode
  // unsent: only a real failure is propagated.
  async _switchOn(onOffCapId) {
    try {
      await this.ctx.setCapValue(onOffCapId, '1');
    } catch (err) {
      if (!isCapabilityUnsupportedError(err)) throw err;
      this.ctx.log(`No on/off capability (${onOffCapId}) on this tank; setting the mode alone`);
    }
  }

  async setBoost(value) {
    if (!this.caps.BOOST) {
      throw new Error('This Cozytouch water heater has no boost capability');
    }
    await this.ctx.setCapValue(this.caps.BOOST, value ? '1' : '0');
  }

  async setAwayMode(value) {
    if (!this.caps.AWAY_MODE) {
      throw new Error('This Cozytouch water heater has no away capability');
    }
    await this.ctx.setCapValue(this.caps.AWAY_MODE, value ? '1' : '0');
  }

  async updateState() {
    const caps = await this.ctx.getCapabilities();
    // A capability the product does not have is not read at all, so it does not
    // count as a value this app failed to find.
    const read = (capId) => (capId ? this.ctx.getCapValue(caps, capId) : null);

    const currentTemp = read(this.caps.CURRENT_TEMP);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = read(this.caps.TARGET_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    // A tank that reports no on/off capability is never off — reading its
    // absence as "off" is what made such tanks show Off while running in Manual.
    const onOff = read(this.caps.ON_OFF);
    const isOn = onOff === null || onOff === '1' || onOff === 1 || onOff === true;

    const mode = read(this.caps.HEATING_MODE);
    if (mode !== null) {
      const modeStr = API_TO_HEATER_MODE[parseInt(mode, 10)];
      if (modeStr) {
        this.ctx.setCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
      }
    }

    const boost = read(this.caps.BOOST);
    if (boost !== null) {
      this.ctx.setCapability('cozytouch_boost', boost === '1' || boost === 1 || boost === true);
    }

    const away = read(this.caps.AWAY_MODE);
    if (away !== null) {
      // The AQUEO family reports 2 for an away period that is booked but has
      // not started yet; the user did ask for it, so show the toggle as on.
      const isAway = away === '1' || away === 1 || away === true || away === '2' || away === 2;
      this.ctx.setCapability('cozytouch_away_mode', isAway);
    }

    this._applySetpointRange(read(this.caps.MIN_TEMP), read(this.caps.MAX_TEMP));
  }

  _applySetpointRange(minTemp, maxTemp) {
    const min = parseFloat(minTemp);
    const max = parseFloat(maxTemp);
    const plausible = Number.isFinite(min) && Number.isFinite(max) && min < max
      && min >= SETPOINT_FLOOR && max <= SETPOINT_CEILING;
    if (plausible) {
      this.ctx.setCapabilityOptions('target_temperature', { min, max });
    }
  }

}

module.exports = WaterHeaterCozytouchHandler;
