'use strict';

const { getStateValue } = require('../../../lib/constants/overkiz-mappings');

/**
 * Overkiz handler for AtlanticDomesticHotWaterProductionMBLComponent
 * (modbuslink protocol — e.g. Atlantic Égéo).
 *
 * This widget does NOT support `setCurrentOperatingMode` or `setTargetTemperature`.
 * Mode changes go through `setDHWMode`, away mode through a 4-step absence
 * sequence, and boost through `setBoostMode`.
 */

const CMD = {
  SET_TARGET_DHW_TEMP: 'setTargetDHWTemperature',
  SET_DHW_MODE: 'setDHWMode',
  SET_BOOST_MODE: 'setBoostMode',
  SET_ABSENCE_MODE: 'setAbsenceMode',
  SET_ABSENCE_START: 'setAbsenceStartDate',
  SET_ABSENCE_END: 'setAbsenceEndDate',
  SET_DATE_TIME: 'setDateTime',
};

const STATES = {
  DHW_MODE: 'modbuslink:DHWModeState',
  DHW_BOOST: 'modbuslink:DHWBoostModeState',
  DHW_ABSENCE: 'modbuslink:DHWAbsenceModeState',
  MIDDLE_WATER_TEMP: 'modbuslink:MiddleWaterTemperatureState',
  WATER_TARGET_TEMP: 'core:WaterTargetTemperatureState',
};

const MODE_TO_DHW = {
  manual: 'manualEcoInactive',
  eco_plus: 'autoMode',
  auto: 'autoMode',
};

function nowDateDict() {
  const d = new Date();
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
    weekday: ((d.getDay() + 6) % 7) + 1,
  };
}

class WaterHeaterOverkizMblHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(CMD.SET_TARGET_DHW_TEMP, [value]);
  }

  async setMode(mode) {
    if (mode === 'off') {
      await this._turnAwayOn();
      this.ctx.setCapability('cozytouch_heating_mode', 'off');
      this.ctx.setCapability('cozytouch_away_mode', true);
      return;
    }

    await this.ctx.executeCommand(CMD.SET_ABSENCE_MODE, ['off']);
    await this.ctx.executeCommand(CMD.SET_BOOST_MODE, ['off']);

    const dhwMode = MODE_TO_DHW[mode];
    if (dhwMode) {
      await this.ctx.executeCommand(CMD.SET_DHW_MODE, [dhwMode]);
    }

    this.ctx.setCapability('cozytouch_boost', false);
    this.ctx.setCapability('cozytouch_away_mode', false);
    this.ctx.setCapability('cozytouch_heating_mode', mode);
  }

  async setBoost(value) {
    await this.ctx.executeCommand(CMD.SET_BOOST_MODE, [value ? 'on' : 'off']);
  }

  async setAwayMode(value) {
    if (value) {
      await this._turnAwayOn();
    } else {
      await this.ctx.executeCommand(CMD.SET_ABSENCE_MODE, ['off']);
    }
  }

  async _turnAwayOn() {
    const start = nowDateDict();
    const end = { ...start, year: start.year + 1 };
    await this.ctx.executeCommand(CMD.SET_DATE_TIME, [start]);
    await this.ctx.executeCommand(CMD.SET_ABSENCE_START, [start]);
    await this.ctx.executeCommand(CMD.SET_ABSENCE_END, [end]);
    await this.ctx.executeCommand(CMD.SET_ABSENCE_MODE, ['prog']);
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const currentTemp = getStateValue(states, STATES.MIDDLE_WATER_TEMP);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = getStateValue(states, STATES.WATER_TARGET_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    const boostState = getStateValue(states, STATES.DHW_BOOST);
    const isBoost = boostState === 'on' || boostState === 'prog';
    this.ctx.setCapability('cozytouch_boost', isBoost);

    const absenceState = getStateValue(states, STATES.DHW_ABSENCE);
    const isAway = absenceState === 'on' || absenceState === 'prog';

    if (isAway) {
      this.ctx.setCapability('cozytouch_heating_mode', 'off');
      this.ctx.setCapability('cozytouch_away_mode', true);
      return;
    }

    this.ctx.setCapability('cozytouch_away_mode', false);

    const dhwMode = getStateValue(states, STATES.DHW_MODE);
    if (dhwMode === 'autoMode' || dhwMode === 'manualEcoActive') {
      this.ctx.setCapability('cozytouch_heating_mode', 'eco_plus');
    } else if (dhwMode === 'manualEcoInactive') {
      this.ctx.setCapability('cozytouch_heating_mode', 'manual');
    }
  }

}

module.exports = WaterHeaterOverkizMblHandler;
