'use strict';

const {
  COMMANDS,
  STATES,
  PASS_COZYTOUCH_LEVELS,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

/**
 * Overkiz handler for Atlantic Pass Cozytouch (ref. 602251).
 * Uses setHeatingLevel only — no temperature setpoint on the module itself.
 */
class PassCozytouchOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setOnOff(value) {
    await this.setLevel(value ? 'comfort' : 'off');
  }

  async setLevel(level) {
    if (!PASS_COZYTOUCH_LEVELS.includes(level)) {
      throw new Error(`Unsupported Pass Cozytouch level: ${level}`);
    }
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
    this.ctx.setCapability('cozytouch_pass_level', level);
    this.ctx.setCapability('onoff', level !== 'off');
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const level = getStateValue(states, STATES.HEATING_LEVEL);
    if (level !== null) {
      const normalized = PASS_COZYTOUCH_LEVELS.includes(level) ? level : 'off';
      this.ctx.setCapability('cozytouch_pass_level', normalized);
      this.ctx.setCapability('onoff', normalized !== 'off');
      return;
    }

    // Fallback if heating level state is missing
    const onOff = getStateValue(states, STATES.ON_OFF);
    if (onOff !== null) {
      const isOn = onOff === 'on';
      this.ctx.setCapability('onoff', isOn);
      this.ctx.setCapability('cozytouch_pass_level', isOn ? 'comfort' : 'off');
    }
  }

}

module.exports = PassCozytouchOverkizHandler;
