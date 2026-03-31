'use strict';

const {
  STATES, COMMANDS, EXTRA_COMMANDS,
  OVERKIZ_LEVEL_TO_MODE, MODE_TO_OVERKIZ_LEVEL,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

class TowelRackOverkizHandler {

  constructor(ctx) {
    this.ctx = ctx;
    this._statesLogged = false;
  }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(EXTRA_COMMANDS.SET_TARGET_TEMPERATURE, [value]);
  }

  // Atlantic towel dryers: on/off via setHeatingLevel (no on/off command).
  async setOnOff(value) {
    const level = value ? 'comfort' : 'off';
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
    this.ctx.setCapability('cozytouch_heating_mode', value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const level = MODE_TO_OVERKIZ_LEVEL[mode] || 'off';
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    // Log available states once for debugging
    if (!this._statesLogged) {
      this._statesLogged = true;
      this.ctx.log('Available Overkiz states:', JSON.stringify(
        (states || []).map((s) => ({ name: s.name, value: s.value })),
      ));
    }

    const temp = getStateValue(states, STATES.TEMPERATURE)
      || getStateValue(states, 'core:ComfortRoomTemperatureState');
    if (temp !== null) this.ctx.setCapability('measure_temperature', parseFloat(temp));

    const targetTemp = getStateValue(states, 'core:TargetTemperatureState')
      || getStateValue(states, STATES.COMFORT_HEATING_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    const level = getStateValue(states, STATES.TARGET_HEATING_LEVEL);
    if (level !== null) {
      const modeStr = OVERKIZ_LEVEL_TO_MODE[level] || 'manual';
      this.ctx.setCapability('cozytouch_heating_mode', modeStr);
      this.ctx.setCapability('onoff', modeStr !== 'off');
    } else {
      const onOff = getStateValue(states, STATES.ON_OFF);
      if (onOff !== null) {
        const isOn = onOff === 'on' || onOff === true || onOff === 1;
        this.ctx.setCapability('onoff', isOn);
      }
    }
  }

}

module.exports = TowelRackOverkizHandler;
