'use strict';

const {
  TOWEL_RACK_CAP_IDS: CAP,
  TOWEL_RACK_MODE_TO_API,
  API_TO_TOWEL_RACK_MODE,
} = require('../../../lib/constants/cozytouch-mappings');

class TowelRackCozytouchHandler {

  constructor(ctx) {
    this.ctx = ctx;
    this._capabilitiesLogged = false;
  }

  async setTargetTemperature(value) {
    await this.ctx.setCapValue(CAP.TARGET_TEMP, value);
  }

  // Towel racks have no ON_OFF cap - power goes through HEATING_MODE.
  async setOnOff(value) {
    const modeValue = value ? '1' : '0'; // 1=manual, 0=off
    await this.ctx.setCapValue(CAP.HEATING_MODE, modeValue);
    this.ctx.setCapability('cozytouch_heating_mode', value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const apiValue = TOWEL_RACK_MODE_TO_API[mode];
    if (apiValue !== undefined) {
      await this.ctx.setCapValue(CAP.HEATING_MODE, apiValue);
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const caps = await this.ctx.getCapabilities();

    // Log available capabilities once for debugging
    if (!this._capabilitiesLogged) {
      this._capabilitiesLogged = true;
      this.ctx.log('Available CozyTouch capabilities:', JSON.stringify(
        caps.map((c) => ({ id: c.capabilityId, name: c.name, value: c.value })),
      ));
    }

    const currentTemp = this.ctx.getCapValue(caps, CAP.CURRENT_TEMP);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = this.ctx.getCapValue(caps, CAP.TARGET_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    const mode = this.ctx.getCapValue(caps, CAP.HEATING_MODE);
    if (mode !== null) {
      const modeInt = parseInt(mode, 10);
      const modeStr = API_TO_TOWEL_RACK_MODE[modeInt] || 'off';
      this.ctx.setCapability('cozytouch_heating_mode', modeStr);
      this.ctx.setCapability('onoff', modeStr !== 'off');
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

module.exports = TowelRackCozytouchHandler;
