'use strict';

const {
  STATES, COMMANDS,
  FIL_PILOTE_LEVEL_TO_MODE, MODE_TO_FIL_PILOTE_LEVEL,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

/**
 * Overkiz handler for Atlantic fil pilote interfaces (AtlanticElectricalHeaterIOComponent).
 *
 * These modules only accept setHeatingLevel (off, comfort, eco, frostprotection…).
 * setHeatingOnOffState and setHeatingTargetTemperature are not supported.
 */

class FilPiloteOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setTargetTemperature(_value) {
    throw new Error('Fil pilote interfaces do not support temperature setpoints');
  }

  async setOnOff(value) {
    const level = value ? 'comfort' : 'off';
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
    this.ctx.setCapability('cozytouch_heating_mode', value ? 'manual' : 'off');
    this.ctx.setCapability('onoff', value);
  }

  async setMode(mode) {
    const level = MODE_TO_FIL_PILOTE_LEVEL[mode] || 'off';
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const level = getStateValue(states, STATES.TARGET_HEATING_LEVEL)
      || getStateValue(states, 'core:TargetHeatingLevelState');
    if (level !== null) {
      const modeStr = FIL_PILOTE_LEVEL_TO_MODE[level] || 'manual';
      const isOn = level !== 'off' && level !== 'frostprotection' && level !== 'secured';
      this.ctx.setCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
      this.ctx.setCapability('onoff', isOn);
      return;
    }

    const onOff = getStateValue(states, STATES.ON_OFF);
    if (onOff !== null) {
      const isOn = onOff === 'on';
      this.ctx.setCapability('onoff', isOn);
      this.ctx.setCapability('cozytouch_heating_mode', isOn ? 'manual' : 'off');
    }
  }

}

module.exports = FilPiloteOverkizHandler;
