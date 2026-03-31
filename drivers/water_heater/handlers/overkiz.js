'use strict';

const {
  STATES, COMMANDS,
  OVERKIZ_DHW_TO_MODE, MODE_TO_OVERKIZ_DHW,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

class WaterHeaterOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(COMMANDS.SET_DHW_TEMP, [value]);
  }

  async setOnOff(value) {
    await this.ctx.executeCommand(COMMANDS.SET_DHW_ON_OFF, [value ? 'on' : 'off']);
    if (!value) this.ctx.setCapability('cozytouch_heating_mode', 'off');
  }

  async setMode(mode) {
    if (mode === 'off') {
      await this.ctx.executeCommand(COMMANDS.SET_DHW_ON_OFF, ['off']);
      this.ctx.setCapability('onoff', false);
    } else {
      await this.ctx.executeCommand(COMMANDS.SET_DHW_ON_OFF, ['on']);
      this.ctx.setCapability('onoff', true);
      const dhwMode = MODE_TO_OVERKIZ_DHW[mode];
      if (dhwMode) {
        await this.ctx.executeCommand(COMMANDS.SET_DHW_MODE, [dhwMode]);
      }
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
  }

  async setAwayMode(value) {
    if (value) {
      await this.ctx.executeCommand(COMMANDS.SET_ABSENCE_MODE, ['on']);
    } else {
      await this.ctx.executeCommand(COMMANDS.CANCEL_ABSENCE, []);
    }
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const currentTemp = getStateValue(states, STATES.DHW_TEMP)
      || getStateValue(states, STATES.MIDDLE_WATER_TEMP)
      || getStateValue(states, STATES.BOTTOM_WATER_TEMP)
      || getStateValue(states, STATES.TEMPERATURE);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = getStateValue(states, STATES.TARGET_DHW_TEMP)
      || getStateValue(states, STATES.COMFORT_DHW_TEMP)
      || getStateValue(states, STATES.WATER_TARGET_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    const onOff = getStateValue(states, STATES.DHW_ON_OFF)
      || getStateValue(states, STATES.ON_OFF);
    if (onOff !== null) {
      const isOn = onOff === 'on' || onOff === true || onOff === 1;
      this.ctx.setCapability('onoff', isOn);
    }

    const dhwMode = getStateValue(states, STATES.DHW_MODE);
    if (dhwMode !== null) {
      const modeStr = OVERKIZ_DHW_TO_MODE[dhwMode] || 'manual';
      const isOn = onOff === 'on' || onOff === true || onOff === 1 || onOff === null;
      this.ctx.setCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
    }

    const absence = getStateValue(states, STATES.DHW_ABSENCE);
    if (absence !== null) {
      this.ctx.setCapability('cozytouch_away_mode', absence === 'on' || absence === true || absence === 1);
    }
  }

}

module.exports = WaterHeaterOverkizHandler;
