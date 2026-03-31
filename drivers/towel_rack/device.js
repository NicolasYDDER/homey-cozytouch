'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const OverkizAPI = require('../../lib/OverkizAPI');

const { STATES, COMMANDS } = OverkizAPI;

// CozyTouch (Magellan) capability IDs
const CAP_IDS = {
  TARGET_TEMP: 2,
  CURRENT_TEMP: 7,
  HEATING_MODE: 1,
  ON_OFF: 3,
  MIN_TEMP: 160,
  MAX_TEMP: 161,
};

const HEATING_MODE_TO_API = { off: null, manual: '0', eco_plus: '3', prog: '4' };
const API_TO_HEATING_MODE = { 0: 'manual', 3: 'eco_plus', 4: 'prog' };

// Overkiz Atlantic towel dryers use setHeatingLevel only (no separate on/off)
// Levels: "off", "comfort", "eco", "frostprotection"
const MODE_TO_OVERKIZ_LEVEL = { off: 'off', manual: 'comfort', eco_plus: 'eco', prog: 'comfort' };
const OVERKIZ_LEVEL_TO_MODE = { off: 'off', comfort: 'manual', eco: 'eco_plus', frostprotection: 'off' };

class TowelRackDevice extends CozyTouchDevice {

  _registerCapabilityListeners() {
    this.registerCapabilityListener('target_temperature', async (value) => {
      this.log(`Setting target temperature to ${value}`);
      if (this._protocol === 'overkiz') {
        await this._executeOverkizCommand('setTargetTemperature', [value]);
      } else {
        await this._setCapValue(CAP_IDS.TARGET_TEMP, value);
      }
    });

    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`Setting power to ${value ? 'ON' : 'OFF'}`);
      if (this._protocol === 'overkiz') {
        // Atlantic towel dryers: on/off is controlled via heating level
        const level = value ? 'comfort' : 'off';
        await this._executeOverkizCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
      } else {
        await this._setCapValue(CAP_IDS.ON_OFF, value ? '1' : '0');
      }
      if (!value) this._safeSetCapability('cozytouch_heating_mode', 'off');
      if (value) this._safeSetCapability('cozytouch_heating_mode', 'manual');
    });

    this.registerCapabilityListener('cozytouch_heating_mode', async (value) => {
      this.log(`Setting heating mode to ${value}`);
      await this.setHeatingMode(value);
    });
  }

  async setHeatingMode(mode) {
    if (this._protocol === 'overkiz') {
      // Atlantic towel dryers: everything goes through setHeatingLevel
      const level = MODE_TO_OVERKIZ_LEVEL[mode] || 'off';
      await this._executeOverkizCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
      this._safeSetCapability('onoff', mode !== 'off');
    } else {
      if (mode === 'off') {
        await this._setCapValue(CAP_IDS.ON_OFF, '0');
        this._safeSetCapability('onoff', false);
      } else {
        await this._setCapValue(CAP_IDS.ON_OFF, '1');
        this._safeSetCapability('onoff', true);
        const apiValue = HEATING_MODE_TO_API[mode];
        if (apiValue !== null && apiValue !== undefined) {
          await this._setCapValue(CAP_IDS.HEATING_MODE, apiValue);
        }
      }
    }
    this._safeSetCapability('cozytouch_heating_mode', mode);
  }

  _updateFromCozytouch(capabilities) {
    const currentTemp = this._getCapValue(capabilities, CAP_IDS.CURRENT_TEMP);
    if (currentTemp !== null) this._safeSetCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = this._getCapValue(capabilities, CAP_IDS.TARGET_TEMP);
    if (targetTemp !== null) this._safeSetCapability('target_temperature', parseFloat(targetTemp));

    const onOff = this._getCapValue(capabilities, CAP_IDS.ON_OFF);
    if (onOff !== null) {
      this._safeSetCapability('onoff', onOff === '1' || onOff === 1 || onOff === true);
    }

    const mode = this._getCapValue(capabilities, CAP_IDS.HEATING_MODE);
    if (mode !== null) {
      const modeStr = API_TO_HEATING_MODE[parseInt(mode, 10)];
      if (modeStr) {
        const isOn = onOff === '1' || onOff === 1 || onOff === true;
        this._safeSetCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
      }
    }

    const minTemp = this._getCapValue(capabilities, CAP_IDS.MIN_TEMP);
    const maxTemp = this._getCapValue(capabilities, CAP_IDS.MAX_TEMP);
    if (minTemp !== null && maxTemp !== null) {
      this.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp), max: parseFloat(maxTemp),
      }).catch(this.error);
    }
  }

  _updateFromOverkiz(states) {
    const temp = this._getStateValue(states, STATES.TEMPERATURE)
      || this._getStateValue(states, 'core:ComfortRoomTemperatureState');
    if (temp !== null) this._safeSetCapability('measure_temperature', parseFloat(temp));

    const targetTemp = this._getStateValue(states, 'core:TargetTemperatureState')
      || this._getStateValue(states, STATES.COMFORT_HEATING_TEMP);
    if (targetTemp !== null) this._safeSetCapability('target_temperature', parseFloat(targetTemp));

    // Atlantic towel dryers report state via TargetHeatingLevelState
    const level = this._getStateValue(states, STATES.TARGET_HEATING_LEVEL);
    if (level !== null) {
      const modeStr = OVERKIZ_LEVEL_TO_MODE[level] || 'manual';
      this._safeSetCapability('cozytouch_heating_mode', modeStr);
      this._safeSetCapability('onoff', modeStr !== 'off');
    } else {
      // Fallback to OnOffState
      const onOff = this._getStateValue(states, STATES.ON_OFF);
      if (onOff !== null) {
        const isOn = onOff === 'on' || onOff === true || onOff === 1;
        this._safeSetCapability('onoff', isOn);
      }
    }
  }

}

module.exports = TowelRackDevice;
