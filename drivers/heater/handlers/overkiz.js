'use strict';

const {
  STATES, COMMANDS,
  OVERKIZ_LEVEL_TO_MODE, MODE_TO_OVERKIZ_LEVEL,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

class HeaterOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_TARGET_TEMP, [value]);
  }

  async setOnOff(value) {
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_ON_OFF, [value ? 'on' : 'off']);
    if (!value) this.ctx.setCapability('cozytouch_heating_mode', 'off');
  }

  async setMode(mode) {
    if (mode === 'off') {
      await this.ctx.executeCommand(COMMANDS.SET_HEATING_ON_OFF, ['off']);
      this.ctx.setCapability('onoff', false);
    } else {
      await this.ctx.executeCommand(COMMANDS.SET_HEATING_ON_OFF, ['on']);
      const level = MODE_TO_OVERKIZ_LEVEL[mode] || 'comfort';
      await this.ctx.executeCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
      this.ctx.setCapability('onoff', true);
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const temp = getStateValue(states, STATES.TEMPERATURE);
    if (temp !== null) this.ctx.setCapability('measure_temperature', parseFloat(temp));

    const targetTemp = getStateValue(states, STATES.HEATING_TARGET_TEMP)
      || getStateValue(states, STATES.COMFORT_HEATING_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    const onOff = getStateValue(states, STATES.HEATING_ON_OFF)
      || getStateValue(states, STATES.ON_OFF);
    if (onOff !== null) {
      const isOn = onOff === 'on' || onOff === true || onOff === 1;
      this.ctx.setCapability('onoff', isOn);
    }

    const level = getStateValue(states, STATES.TARGET_HEATING_LEVEL);
    if (level !== null) {
      const modeStr = OVERKIZ_LEVEL_TO_MODE[level] || 'manual';
      const isOn = onOff === 'on' || onOff === true || onOff === 1;
      this.ctx.setCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
    }

    const minTemp = getStateValue(states, STATES.MIN_HEATING_TEMP);
    const maxTemp = getStateValue(states, STATES.MAX_HEATING_TEMP);
    if (minTemp !== null && maxTemp !== null) {
      this.ctx.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp), max: parseFloat(maxTemp),
      });
    }
  }

}

module.exports = HeaterOverkizHandler;
