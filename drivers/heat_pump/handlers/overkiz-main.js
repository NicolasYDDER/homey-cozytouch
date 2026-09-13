'use strict';

const {
  PASS_APC_STATES,
  PASS_APC_COMMANDS,
  PASS_APC_OPERATING_TO_HVAC,
  PASS_APC_HVAC_TO_OPERATING,
  STATES,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');
const { pickCommand } = require('../../../lib/helpers/overkiz-commands');

/**
 * Overkiz handler for the main unit of a Pass APC heat pump
 * (AtlanticPassAPCHeatPumpMainComponent).
 *
 * It carries the system mode for the whole product — heating, cooling, drying or
 * stop — which every circuit then follows. Automatic is the heating/cooling auto
 * switch and only exists on units that can cool.
 *
 * measure_temperature is the outside probe of the stack
 * (AtlanticPassAPCOutsideTemperatureSensor), linked at pairing time: the main
 * component itself reports no temperature.
 */
class HeatPumpMainOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  /**
   * Command name this unit advertises. Returns null for optional commands the
   * product does not have (a heating-only unit has no auto switch), and throws
   * for the ones it cannot work without.
   */
  _command(candidates, { required = true } = {}) {
    const name = pickCommand(this.ctx.store.overkizCommands, candidates);
    if (!name && required) {
      throw new Error(`This heat pump accepts none of these commands: ${candidates.join(', ')}`);
    }
    return name;
  }

  _hasCooling() {
    return this.ctx.store.passApcCooling !== false;
  }

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
    await this.setMode(hvacMode === 'off' ? 'heat' : hvacMode);
  }

  async setMode(mode) {
    const autoSwitch = this._command([PASS_APC_COMMANDS.SET_AUTO_SWITCH], { required: false });

    if (mode === 'auto') {
      if (!autoSwitch) {
        throw new Error('This heat pump has no heating/cooling auto switch');
      }
      await this.ctx.executeCommand(autoSwitch, ['on']);
      this.ctx.setCapability('cozytouch_hvac_mode', 'auto');
      this.ctx.setCapability('onoff', true);
      return;
    }

    if (autoSwitch) {
      await this.ctx.executeCommand(autoSwitch, ['off']);
    }

    const operatingMode = mode === 'off' ? 'stop' : PASS_APC_HVAC_TO_OPERATING[mode];
    if (!operatingMode) {
      throw new Error(`Unsupported HVAC mode: ${mode}`);
    }

    await this.ctx.executeCommand(
      this._command([PASS_APC_COMMANDS.SET_OPERATING_MODE]),
      [operatingMode],
    );

    this.ctx.setCapability('cozytouch_hvac_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  /** Outside temperature, from the probe endpoint linked at pairing time. */
  async _readOutsideTemperature() {
    const sensorUrl = this.ctx.store.passApcOutsideSensorURL;
    if (!sensorUrl) return null;

    try {
      const sensorStates = await this.ctx.api.getDeviceState(sensorUrl);
      return getStateValue(sensorStates, STATES.TEMPERATURE);
    } catch (err) {
      this.ctx.log(`Outside temperature probe unavailable: ${err.message}`);
      return null;
    }
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    if (this.ctx.hasCapability('measure_temperature')) {
      const outsideTemp = await this._readOutsideTemperature();
      if (outsideTemp !== null) {
        this.ctx.setCapability('measure_temperature', parseFloat(outsideTemp));
      }
    }

    // Auto switch wins: while it is on, the heat pump picks heating or cooling
    // itself and the operating mode only says what it settled on.
    if (this._hasCooling() && getStateValue(states, PASS_APC_STATES.AUTO_SWITCH) === 'on') {
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

module.exports = HeatPumpMainOverkizHandler;
