'use strict';

const {
  WATER_HEATER_CAP_IDS: CAP,
  HEATER_MODE_TO_API,
  API_TO_HEATER_MODE,
} = require('../../../lib/constants/cozytouch-mappings');

/**
 * Cozytouch (Magellan) handler for domestic hot water tanks — e.g. Calypso
 * connecté, whose gateway only answers on Magellan, never on Overkiz.
 *
 * Modes come from capability 1 (0=manual, 3=eco+, 4=prog); there is no auto
 * value, so the driver never offers Auto on this protocol.
 */
class WaterHeaterCozytouchHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setTargetTemperature(value) {
    await this.ctx.setCapValue(CAP.TARGET_TEMP, value);
  }

  async setMode(mode) {
    if (mode === 'off') {
      await this.ctx.setCapValue(CAP.ON_OFF, '0');
    } else {
      const apiValue = HEATER_MODE_TO_API[mode];
      // Fail loudly instead of only switching the tank on and leaving it in
      // whatever mode it was: the caller shows the error to the user.
      if (apiValue === null || apiValue === undefined) {
        throw new Error(`Unsupported heating mode for a Cozytouch water heater: ${mode}`);
      }
      await this.ctx.setCapValue(CAP.ON_OFF, '1');
      await this.ctx.setCapValue(CAP.HEATING_MODE, apiValue);
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
  }

  async setBoost(value) {
    await this.ctx.setCapValue(CAP.BOOST, value ? '1' : '0');
  }

  async setAwayMode(value) {
    await this.ctx.setCapValue(CAP.AWAY_MODE, value ? '1' : '0');
  }

  async updateState() {
    const caps = await this.ctx.getCapabilities();

    const currentTemp = this.ctx.getCapValue(caps, CAP.CURRENT_TEMP);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = this.ctx.getCapValue(caps, CAP.TARGET_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    const onOff = this.ctx.getCapValue(caps, CAP.ON_OFF);
    const isOn = onOff === '1' || onOff === 1 || onOff === true;

    const mode = this.ctx.getCapValue(caps, CAP.HEATING_MODE);
    if (mode !== null) {
      const modeStr = API_TO_HEATER_MODE[parseInt(mode, 10)];
      if (modeStr) {
        this.ctx.setCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
      }
    }

    const boost = this.ctx.getCapValue(caps, CAP.BOOST);
    if (boost !== null) {
      this.ctx.setCapability('cozytouch_boost', boost === '1' || boost === 1 || boost === true);
    }

    const away = this.ctx.getCapValue(caps, CAP.AWAY_MODE);
    if (away !== null) {
      this.ctx.setCapability('cozytouch_away_mode', away === '1' || away === 1 || away === true);
    }

    const minTemp = this.ctx.getCapValue(caps, CAP.MIN_TEMP);
    const maxTemp = this.ctx.getCapValue(caps, CAP.MAX_TEMP);
    if (minTemp !== null && maxTemp !== null) {
      this.ctx.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp), max: parseFloat(maxTemp),
      });
    }
  }

}

module.exports = WaterHeaterCozytouchHandler;
