'use strict';

const {
  PASS_APC_STATES,
  PASS_APC_COMMANDS,
  PASS_APC_OPERATING_TO_HVAC,
  HVAC_TO_PASS_APC_OPERATING,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

/**
 * Overkiz handler for Atlantic Pass APC global zone controller
 * (AtlanticPassAPCZoneControlMainComponent — Shogun Zone Control 2.0).
 *
 * Auto is exposed in the same HVAC picker as heat/cool/dry/off:
 * - auto → setHeatingCoolingAutoSwitch('on')
 * - other → auto switch off + setPassAPCOperatingMode(...)
 */
class PassAPCZoneControlOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setOnOff(value) {
    if (!value) {
      await this.setMode('off');
      return;
    }

    const states = await this.ctx.getDeviceState();
    const lastMode = getStateValue(states, PASS_APC_STATES.LAST_OPERATING_MODE)
      || getStateValue(states, PASS_APC_STATES.OPERATING_MODE)
      || 'heating';
    const hvacMode = PASS_APC_OPERATING_TO_HVAC[lastMode] || 'heat';
    if (hvacMode === 'off') {
      await this.setMode('heat');
      return;
    }
    await this.setMode(hvacMode);
  }

  async setMode(mode) {
    if (mode === 'auto') {
      await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_AUTO_SWITCH, ['on']);
      this.ctx.setCapability('cozytouch_hvac_mode', 'auto');
      this.ctx.setCapability('onoff', true);
      return;
    }

    await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_AUTO_SWITCH, ['off']);

    if (mode === 'off') {
      await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_OPERATING_MODE, ['stop']);
    } else {
      const overkizMode = HVAC_TO_PASS_APC_OPERATING[mode];
      if (!overkizMode) {
        throw new Error(`Unsupported HVAC mode: ${mode}`);
      }
      await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_OPERATING_MODE, [overkizMode]);
    }

    this.ctx.setCapability('cozytouch_hvac_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const autoSwitch = getStateValue(states, PASS_APC_STATES.AUTO_SWITCH);
    if (autoSwitch === 'on') {
      this.ctx.setCapability('cozytouch_hvac_mode', 'auto');
      this.ctx.setCapability('onoff', true);
      return;
    }

    const operatingMode = getStateValue(states, PASS_APC_STATES.OPERATING_MODE);
    if (operatingMode !== null) {
      const hvacMode = PASS_APC_OPERATING_TO_HVAC[operatingMode] || 'off';
      this.ctx.setCapability('cozytouch_hvac_mode', hvacMode);
      this.ctx.setCapability('onoff', hvacMode !== 'off');
    }
  }

}

module.exports = PassAPCZoneControlOverkizHandler;
