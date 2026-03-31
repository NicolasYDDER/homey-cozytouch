'use strict';

const {
  STATES,
  OVERKIZ_DHW_TO_MODE, MODE_TO_OVERKIZ_DHW,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');

/**
 * Overkiz handler for Atlantic Domestic Hot Water V2 (CETHI_V4).
 *
 * This device has NO on/off command. It is always running.
 * Control is via DHW mode (manualEcoInactive/manualEcoActive/autoMode)
 * and away mode via setCurrentOperatingMode.
 */

const CMD = {
  SET_OPERATING_MODE: 'setCurrentOperatingMode',
  SET_DHW_MODE: 'setDHWMode',
  SET_TARGET_TEMP: 'setTargetTemperature',
  SET_BOOST_DURATION: 'setBoostModeDuration',
  REFRESH_BOOST: 'refreshBoostModeDuration',
  SET_SHOWER_COUNT: 'setExpectedNumberOfShower',
};

class WaterHeaterOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(CMD.SET_TARGET_TEMP, [value]);
  }

  async setOnOff(value) {
    // No real on/off — simulate via away mode
    await this.ctx.executeCommand(CMD.SET_OPERATING_MODE, [
      { relaunch: 'off', absence: value ? 'off' : 'on' },
    ]);
    if (!value) {
      this.ctx.setCapability('cozytouch_heating_mode', 'off');
    }
  }

  async setMode(mode) {
    if (mode === 'off') {
      await this.ctx.executeCommand(CMD.SET_OPERATING_MODE, [
        { relaunch: 'off', absence: 'on' },
      ]);
      this.ctx.setCapability('onoff', false);
    } else {
      // Ensure away and boost are off before changing mode
      await this.ctx.executeCommand(CMD.SET_OPERATING_MODE, [
        { relaunch: 'off', absence: 'off' },
      ]);
      const dhwMode = MODE_TO_OVERKIZ_DHW[mode];
      if (dhwMode) {
        await this.ctx.executeCommand(CMD.SET_DHW_MODE, [dhwMode]);
      }
      this.ctx.setCapability('onoff', true);
      this.ctx.setCapability('cozytouch_boost', false);
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
  }

  async setBoost(value) {
    if (value) {
      await this.ctx.executeCommand(CMD.SET_BOOST_DURATION, [7]);
      await this.ctx.executeCommand(CMD.SET_OPERATING_MODE, [
        { relaunch: 'on', absence: 'off' },
      ]);
    } else {
      await this.ctx.executeCommand(CMD.SET_OPERATING_MODE, [
        { relaunch: 'off', absence: 'off' },
      ]);
    }
    await this.ctx.executeCommand(CMD.REFRESH_BOOST, []);
  }

  async setShowerCount(value) {
    await this.ctx.executeCommand(CMD.SET_SHOWER_COUNT, [Math.round(value)]);
  }

  async setAwayMode(value) {
    await this.ctx.executeCommand(CMD.SET_OPERATING_MODE, [
      { relaunch: 'off', absence: value ? 'on' : 'off' },
    ]);
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const currentTemp = getStateValue(states, STATES.MIDDLE_WATER_TEMP)
      || getStateValue(states, STATES.BOTTOM_WATER_TEMP)
      || getStateValue(states, STATES.DHW_TEMP)
      || getStateValue(states, STATES.TEMPERATURE);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = getStateValue(states, 'core:TargetTemperatureState')
      || getStateValue(states, STATES.COMFORT_DHW_TEMP)
      || getStateValue(states, STATES.WATER_TARGET_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    // Boost state
    const boostDuration = getStateValue(states, 'core:BoostModeDurationState');
    const isBoost = boostDuration !== null && boostDuration > 0;
    this.ctx.setCapability('cozytouch_boost', isBoost);

    // Away state
    const awayDuration = getStateValue(states, 'io:AwayModeDurationState');
    const isAway = awayDuration !== null && awayDuration !== '0' && awayDuration !== 0;

    // Shower count
    const showerCount = getStateValue(states, 'core:ExpectedNumberOfShowerState');
    if (showerCount !== null) this.ctx.setCapability('cozytouch_shower_count', parseInt(showerCount, 10));

    // Dynamic shower range from device
    const minShower = getStateValue(states, 'core:MinimalShowerManualModeState');
    const maxShower = getStateValue(states, 'core:MaximalShowerManualModeState');
    if (minShower !== null && maxShower !== null) {
      this.ctx.setCapabilityOptions('cozytouch_shower_count', {
        min: parseInt(minShower, 10),
        max: parseInt(maxShower, 10),
      });
    }

    // Mode
    if (isAway) {
      this.ctx.setCapability('cozytouch_heating_mode', 'off');
      this.ctx.setCapability('onoff', false);
      this.ctx.setCapability('cozytouch_away_mode', true);
    } else {
      const dhwMode = getStateValue(states, STATES.DHW_MODE);
      if (dhwMode !== null) {
        const modeStr = OVERKIZ_DHW_TO_MODE[dhwMode] || 'manual';
        this.ctx.setCapability('cozytouch_heating_mode', modeStr);
      }
      this.ctx.setCapability('onoff', true);
      this.ctx.setCapability('cozytouch_away_mode', false);
    }
  }

}

module.exports = WaterHeaterOverkizHandler;
