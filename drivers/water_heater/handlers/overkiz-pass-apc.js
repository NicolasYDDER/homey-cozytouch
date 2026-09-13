'use strict';

const {
  OVERKIZ_DHW_TO_MODE,
  MODE_TO_OVERKIZ_DHW,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');
const { pickCommand } = require('../../../lib/helpers/overkiz-commands');

/**
 * Overkiz handler for the hot water tank of a Pass APC heat pump
 * (AtlanticPassAPCDHWComponent) — the tank of an Alféa Duo, driven by the heat
 * pump itself rather than by its own controller.
 *
 * Mode values are the usual Overkiz DHW ones (autoMode / manualEcoActive /
 * manualEcoInactive), but the command names differ per product: the tank of a
 * Duo takes setPassAPCDHWMode where a standalone tank takes setDHWMode. Every
 * command below is therefore picked from what the device advertises, and a
 * control the tank does not have fails with a message saying so instead of
 * sending something the heat pump refuses.
 */

// Accepted command names, most specific first.
const DHW_COMMANDS = {
  SET_MODE: ['setPassAPCDHWMode', 'setDHWMode'],
  SET_TARGET_TEMP: [
    'setTargetDHWTemperature',
    'setComfortTargetDHWTemperature',
    'setWaterTargetTemperature',
    'setTargetTemperature',
  ],
  SET_ON_OFF: ['setDHWOnOffState'],
  SET_BOOST: ['setBoostOnOffState', 'setBoostMode'],
  SET_ABSENCE: ['setAbsenceMode', 'setDHWAbsenceMode'],
};

const DHW_STATES = {
  MODE: ['io:PassAPCDHWModeState', 'io:DHWModeState', 'core:DHWModeState'],
  ON_OFF: ['core:DHWOnOffState'],
  TARGET_TEMP: [
    'core:TargetDHWTemperatureState',
    'core:ComfortTargetDHWTemperatureState',
    'core:WaterTargetTemperatureState',
    'core:TargetTemperatureState',
  ],
  CURRENT_TEMP: [
    'core:DHWTemperatureState',
    'io:MiddleWaterTemperatureState',
    'core:BottomTankWaterTemperatureState',
    'core:TemperatureState',
  ],
  BOOST: ['core:BoostOnOffState', 'io:DHWBoostModeState'],
  ABSENCE: ['core:DHWAbsenceModeState', 'io:DHWAbsenceModeState'],
};

/** First of `names` the tank reports a value for. */
function firstStateValue(states, names) {
  for (const name of names) {
    const value = getStateValue(states, name);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function isOn(value) {
  return value === 'on' || value === true || value === 1 || value === 'prog';
}

class WaterHeaterOverkizPassApcHandler {

  constructor(ctx) { this.ctx = ctx; }

  _command(candidates, { required = true } = {}) {
    const name = pickCommand(this.ctx.store.overkizCommands, candidates);
    if (!name && required) {
      throw new Error(`This tank accepts none of these commands: ${candidates.join(', ')}`);
    }
    return name;
  }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(this._command(DHW_COMMANDS.SET_TARGET_TEMP), [value]);
  }

  async setMode(mode) {
    if (mode === 'off') {
      await this.ctx.executeCommand(this._command(DHW_COMMANDS.SET_ON_OFF), ['off']);
      this.ctx.setCapability('cozytouch_heating_mode', 'off');
      return;
    }

    const dhwMode = MODE_TO_OVERKIZ_DHW[mode];
    if (!dhwMode) {
      throw new Error(`Unsupported water heater mode: ${mode}`);
    }

    // A tank left off ignores the mode change, so bring it back on first.
    const onOff = this._command(DHW_COMMANDS.SET_ON_OFF, { required: false });
    if (onOff) {
      await this.ctx.executeCommand(onOff, ['on']);
    }
    await this.ctx.executeCommand(this._command(DHW_COMMANDS.SET_MODE), [dhwMode]);

    this.ctx.setCapability('cozytouch_heating_mode', mode);
  }

  async setBoost(value) {
    await this.ctx.executeCommand(this._command(DHW_COMMANDS.SET_BOOST), [value ? 'on' : 'off']);
  }

  async setAwayMode(value) {
    await this.ctx.executeCommand(this._command(DHW_COMMANDS.SET_ABSENCE), [value ? 'on' : 'off']);
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const currentTemp = firstStateValue(states, DHW_STATES.CURRENT_TEMP);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = firstStateValue(states, DHW_STATES.TARGET_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    this.ctx.setCapability('cozytouch_boost', isOn(firstStateValue(states, DHW_STATES.BOOST)));

    const absence = firstStateValue(states, DHW_STATES.ABSENCE);
    const isAway = isOn(absence);
    this.ctx.setCapability('cozytouch_away_mode', isAway);

    const onOff = firstStateValue(states, DHW_STATES.ON_OFF);
    if (onOff !== null && !isOn(onOff)) {
      this.ctx.setCapability('cozytouch_heating_mode', 'off');
      return;
    }
    if (isAway) {
      this.ctx.setCapability('cozytouch_heating_mode', 'off');
      return;
    }

    const dhwMode = firstStateValue(states, DHW_STATES.MODE);
    const mode = OVERKIZ_DHW_TO_MODE[dhwMode];
    if (mode) this.ctx.setCapability('cozytouch_heating_mode', mode);
  }

}

module.exports = WaterHeaterOverkizPassApcHandler;
module.exports.DHW_COMMANDS = DHW_COMMANDS;
module.exports.DHW_STATES = DHW_STATES;
