'use strict';

const { getStateValue } = require('../../../lib/constants/overkiz-mappings');

/**
 * Overkiz handler for Atlantic Electrical Towel Dryers (IC3).
 *
 * Uses setTowelDryerOperatingMode (not setHeatingLevel which is for basic heaters).
 * Operating modes: external=manual, internal=prog, auto=auto, standby=off.
 */

const TOWEL_DRYER_COMMAND = 'setTowelDryerOperatingMode';

const MODE_TO_OVERKIZ = {
  off: 'standby',
  manual: 'external',
  prog: 'internal',
};

const OVERKIZ_TO_MODE = {
  standby: 'off',
  external: 'manual',
  internal: 'prog',
  auto: 'prog',
};

class TowelRackOverkizHandler {

  constructor(ctx) {
    this.ctx = ctx;
  }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand('setTargetTemperature', [value]);
  }

  async setOnOff(value) {
    const overkizMode = value ? 'external' : 'standby';
    await this.ctx.executeCommand(TOWEL_DRYER_COMMAND, [overkizMode]);
    this.ctx.setCapability('cozytouch_heating_mode', value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const overkizMode = MODE_TO_OVERKIZ[mode] || 'standby';
    await this.ctx.executeCommand(TOWEL_DRYER_COMMAND, [overkizMode]);
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const temp = getStateValue(states, 'core:TemperatureState')
      || getStateValue(states, 'core:ComfortRoomTemperatureState');
    if (temp !== null) this.ctx.setCapability('measure_temperature', parseFloat(temp));

    const targetTemp = getStateValue(states, 'core:TargetTemperatureState')
      || getStateValue(states, 'io:EffectiveTemperatureSetpointState');
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    const opMode = getStateValue(states, 'core:OperatingModeState');
    if (opMode !== null) {
      const modeStr = OVERKIZ_TO_MODE[opMode] || 'manual';
      this.ctx.setCapability('cozytouch_heating_mode', modeStr);
      this.ctx.setCapability('onoff', modeStr !== 'off');
    }
  }

}

module.exports = TowelRackOverkizHandler;
