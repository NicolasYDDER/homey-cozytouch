'use strict';

const {
  STATES, COMMANDS, EXTRA_COMMANDS,
  OVERKIZ_LEVEL_TO_MODE, MODE_TO_OVERKIZ_LEVEL,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

class TowelRackOverkizHandler {

  constructor(ctx) {
    this.ctx = ctx;
    this._previousStates = {};
    this._pollCount = 0;
  }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(EXTRA_COMMANDS.SET_TARGET_TEMPERATURE, [value]);
  }

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
    this._pollCount++;

    // ── SPY MODE: detect state changes ────────────────────────
    const currentStates = {};
    for (const s of (states || [])) {
      currentStates[s.name] = String(s.value);
    }

    if (this._pollCount === 1) {
      this.ctx.log('=== OVERKIZ SPY MODE ACTIVE ===');
      this.ctx.log('All states:', JSON.stringify(
        (states || []).map((s) => ({ name: s.name, value: s.value })),
      ));
    }

    if (Object.keys(this._previousStates).length > 0) {
      for (const [name, value] of Object.entries(currentStates)) {
        const prev = this._previousStates[name];
        if (prev !== undefined && prev !== value) {
          this.ctx.log(`>>> CHANGED: ${name}: ${prev} → ${value}`);
        }
      }
    }

    this._previousStates = currentStates;

    // ── Normal state updates ──────────────────────────────────
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
