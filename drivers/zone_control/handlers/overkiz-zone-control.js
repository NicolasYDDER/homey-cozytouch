'use strict';

const {
  ZONE_CONTROL_STATES,
  ZONE_CONTROL_COMMANDS,
  ZONE_CONTROL_OPERATING_TO_HVAC,
  HVAC_TO_ZONE_CONTROL_OPERATING,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

/**
 * Overkiz handler for Shogun Zone Control global controller
 * (AtlanticPassAPCZoneControlMainComponent).
 *
 * Auto is exposed in the same HVAC picker as heat/cool/dry/off:
 * - auto → setHeatingCoolingAutoSwitch('on')
 * - other → auto switch off + setPassAPCOperatingMode(...)
 */
class ZoneControlOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setOnOff(value) {
    if (!value) {
      await this.setMode('off');
      return;
    }

    const states = await this.ctx.getDeviceState();
    const lastMode = getStateValue(states, ZONE_CONTROL_STATES.LAST_OPERATING_MODE)
      || getStateValue(states, ZONE_CONTROL_STATES.OPERATING_MODE)
      || 'heating';
    const hvacMode = ZONE_CONTROL_OPERATING_TO_HVAC[lastMode] || 'heat';
    if (hvacMode === 'off') {
      await this.setMode('heat');
      return;
    }
    await this.setMode(hvacMode);
  }

  async setMode(mode) {
    if (mode === 'auto') {
      await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_AUTO_SWITCH, ['on']);
      this.ctx.setCapability('cozytouch_hvac_mode', 'auto');
      this.ctx.setCapability('onoff', true);
      return;
    }

    await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_AUTO_SWITCH, ['off']);

    if (mode === 'off') {
      await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_OPERATING_MODE, ['stop']);
    } else {
      const overkizMode = HVAC_TO_ZONE_CONTROL_OPERATING[mode];
      if (!overkizMode) {
        throw new Error(`Unsupported HVAC mode: ${mode}`);
      }
      await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_OPERATING_MODE, [overkizMode]);
    }

    this.ctx.setCapability('cozytouch_hvac_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const autoSwitch = getStateValue(states, ZONE_CONTROL_STATES.AUTO_SWITCH);
    if (autoSwitch === 'on') {
      this.ctx.setCapability('cozytouch_hvac_mode', 'auto');
      this.ctx.setCapability('onoff', true);
      return;
    }

    const operatingMode = getStateValue(states, ZONE_CONTROL_STATES.OPERATING_MODE);
    if (operatingMode !== null) {
      const hvacMode = ZONE_CONTROL_OPERATING_TO_HVAC[operatingMode] || 'off';
      this.ctx.setCapability('cozytouch_hvac_mode', hvacMode);
      this.ctx.setCapability('onoff', hvacMode !== 'off');
    }
  }

}

module.exports = ZoneControlOverkizHandler;
