'use strict';

const {
  STATES, COMMANDS,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

class ClimateOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_TARGET_TEMP, [value]);
  }

  async setOnOff(value) {
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_ON_OFF, [value ? 'on' : 'off']);
    this.ctx.setCapability('cozytouch_hvac_mode', value ? 'heat' : 'off');
  }

  async setMode(mode) {
    if (mode === 'off') {
      await this.ctx.executeCommand(COMMANDS.SET_HEATING_ON_OFF, ['off']);
    } else {
      await this.ctx.executeCommand(COMMANDS.SET_HEATING_ON_OFF, ['on']);
    }
    this.ctx.setCapability('cozytouch_hvac_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const currentTemp = getStateValue(states, STATES.TEMPERATURE);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = getStateValue(states, STATES.HEATING_TARGET_TEMP)
      || getStateValue(states, STATES.COMFORT_HEATING_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    const onOff = getStateValue(states, STATES.HEATING_ON_OFF)
      || getStateValue(states, STATES.ON_OFF);
    if (onOff !== null) {
      const isOn = onOff === 'on' || onOff === true || onOff === 1;
      this.ctx.setCapability('onoff', isOn);
      this.ctx.setCapability('cozytouch_hvac_mode', isOn ? 'heat' : 'off');
    }
  }

}

module.exports = ClimateOverkizHandler;
