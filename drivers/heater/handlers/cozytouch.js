'use strict';

const {
  HEATER_CAP_IDS: CAP,
  HEATER_MODE_TO_API,
  API_TO_HEATER_MODE,
} = require('../../../lib/constants/cozytouch-mappings');

class HeaterCozytouchHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setTargetTemperature(value) {
    await this.ctx.setCapValue(CAP.TARGET_TEMP, value);
  }

  async setOnOff(value) {
    await this.ctx.setCapValue(CAP.ON_OFF, value ? '1' : '0');
    if (!value) this.ctx.setCapability('cozytouch_heating_mode', 'off');
  }

  async setMode(mode) {
    if (mode === 'off') {
      await this.ctx.setCapValue(CAP.ON_OFF, '0');
      this.ctx.setCapability('onoff', false);
    } else {
      await this.ctx.setCapValue(CAP.ON_OFF, '1');
      this.ctx.setCapability('onoff', true);
      const apiValue = HEATER_MODE_TO_API[mode];
      if (apiValue !== null && apiValue !== undefined) {
        await this.ctx.setCapValue(CAP.HEATING_MODE, apiValue);
      }
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
  }

  async updateState() {
    const caps = await this.ctx.getCapabilities();

    const currentTemp = this.ctx.getCapValue(caps, CAP.CURRENT_TEMP);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = this.ctx.getCapValue(caps, CAP.TARGET_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    const onOff = this.ctx.getCapValue(caps, CAP.ON_OFF);
    if (onOff !== null) {
      this.ctx.setCapability('onoff', onOff === '1' || onOff === 1 || onOff === true);
    }

    const mode = this.ctx.getCapValue(caps, CAP.HEATING_MODE);
    if (mode !== null) {
      const modeStr = API_TO_HEATER_MODE[parseInt(mode, 10)];
      if (modeStr) {
        const isOn = onOff === '1' || onOff === 1 || onOff === true;
        this.ctx.setCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
      }
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

module.exports = HeaterCozytouchHandler;
