'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');
const OverkizAPI = require('../../lib/OverkizAPI');

const { STATES, COMMANDS } = OverkizAPI;

// CozyTouch (Magellan) capability IDs
const CAP_IDS = {
  HVAC_MODE: 1,
  TARGET_TEMP_HEAT: 2,
  TARGET_TEMP_COOL: 8,
  ON_OFF: 3,
  CURRENT_TEMP: 7,
  FAN_MODE: 4,
  SWING_MODE: 9,
  MIN_TEMP_HEAT: 160,
  MAX_TEMP_HEAT: 161,
  MIN_TEMP_COOL: 162,
  MAX_TEMP_COOL: 163,
};

const FAN_MODE_TO_API = { auto: '0', low: '1', medium: '2', high: '3' };
const API_TO_FAN_MODE = { 0: 'auto', 1: 'low', 2: 'medium', 3: 'high' };
const SWING_MODE_TO_API = { up: '0', middle_up: '1', middle_down: '2', down: '3' };
const API_TO_SWING_MODE = { 0: 'up', 1: 'middle_up', 2: 'middle_down', 3: 'down' };

class ClimateDevice extends CozyTouchDevice {

  async onInit() {
    const store = this.getStore();

    if (store.protocol === 'cozytouch') {
      this._hvacModes = store.hvacModes || CozyTouchAPI.HVAC_MODES.default;
      this._deviceType = store.deviceType || 'UNKNOWN';
      this._hvacModeToApi = {};
      for (const [apiVal, modeStr] of Object.entries(this._hvacModes)) {
        this._hvacModeToApi[modeStr] = parseInt(apiVal, 10);
      }
    }

    this._currentHvacMode = 'off';
    await super.onInit();
  }

  _registerCapabilityListeners() {
    this.registerCapabilityListener('target_temperature', async (value) => {
      this.log(`Setting target temperature to ${value}`);
      if (this._protocol === 'overkiz') {
        await this._executeOverkizCommand(COMMANDS.SET_HEATING_TARGET_TEMP, [value]);
      } else {
        const capId = (this._currentHvacMode === 'cool' || this._currentHvacMode === 'dry')
          ? CAP_IDS.TARGET_TEMP_COOL : CAP_IDS.TARGET_TEMP_HEAT;
        await this._setCapValue(capId, value);
      }
    });

    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`Setting power to ${value ? 'ON' : 'OFF'}`);
      if (this._protocol === 'overkiz') {
        await this._executeOverkizCommand(COMMANDS.SET_HEATING_ON_OFF, [value ? 'on' : 'off']);
        this._safeSetCapability('cozytouch_hvac_mode', value ? 'heat' : 'off');
      } else {
        if (!value) {
          await this._setCapValue(CAP_IDS.HVAC_MODE, '0');
          this._safeSetCapability('cozytouch_hvac_mode', 'off');
        } else {
          const mode = this._currentHvacMode !== 'off' ? this._currentHvacMode : 'heat';
          const apiVal = this._hvacModeToApi[mode];
          if (apiVal !== undefined) {
            await this._setCapValue(CAP_IDS.HVAC_MODE, String(apiVal));
            this._safeSetCapability('cozytouch_hvac_mode', mode);
          }
        }
      }
    });

    this.registerCapabilityListener('cozytouch_hvac_mode', async (value) => {
      this.log(`Setting HVAC mode to ${value}`);
      await this.setHvacMode(value);
    });

    if (this.hasCapability('cozytouch_fan_mode')) {
      this.registerCapabilityListener('cozytouch_fan_mode', async (value) => {
        this.log(`Setting fan mode to ${value}`);
        const apiVal = FAN_MODE_TO_API[value];
        if (apiVal !== undefined) await this._setCapValue(CAP_IDS.FAN_MODE, apiVal);
      });
    }

    if (this.hasCapability('cozytouch_swing_mode')) {
      this.registerCapabilityListener('cozytouch_swing_mode', async (value) => {
        this.log(`Setting swing mode to ${value}`);
        const apiVal = SWING_MODE_TO_API[value];
        if (apiVal !== undefined) await this._setCapValue(CAP_IDS.SWING_MODE, apiVal);
      });
    }
  }

  async setHvacMode(mode) {
    if (this._protocol === 'overkiz') {
      if (mode === 'off') {
        await this._executeOverkizCommand(COMMANDS.SET_HEATING_ON_OFF, ['off']);
      } else {
        await this._executeOverkizCommand(COMMANDS.SET_HEATING_ON_OFF, ['on']);
      }
      this._currentHvacMode = mode;
      this._safeSetCapability('cozytouch_hvac_mode', mode);
      this._safeSetCapability('onoff', mode !== 'off');
    } else {
      const apiVal = this._hvacModeToApi[mode];
      if (apiVal !== undefined) {
        await this._setCapValue(CAP_IDS.HVAC_MODE, String(apiVal));
        this._currentHvacMode = mode;
        this._safeSetCapability('cozytouch_hvac_mode', mode);
        this._safeSetCapability('onoff', mode !== 'off');
      }
    }
  }

  // ── CozyTouch polling ───────────────────────────────────────────

  _updateFromCozytouch(capabilities) {
    const currentTemp = this._getCapValue(capabilities, CAP_IDS.CURRENT_TEMP);
    if (currentTemp !== null) this._safeSetCapability('measure_temperature', parseFloat(currentTemp));

    const hvacMode = this._getCapValue(capabilities, CAP_IDS.HVAC_MODE);
    if (hvacMode !== null) {
      const modeStr = this._hvacModes[parseInt(hvacMode, 10)];
      if (modeStr) {
        this._currentHvacMode = modeStr;
        this._safeSetCapability('cozytouch_hvac_mode', modeStr);
        this._safeSetCapability('onoff', modeStr !== 'off');
      }
    }

    const isCooling = this._currentHvacMode === 'cool' || this._currentHvacMode === 'dry';
    const targetTemp = this._getCapValue(capabilities, isCooling ? CAP_IDS.TARGET_TEMP_COOL : CAP_IDS.TARGET_TEMP_HEAT);
    if (targetTemp !== null) this._safeSetCapability('target_temperature', parseFloat(targetTemp));

    if (this.hasCapability('cozytouch_fan_mode')) {
      const fanMode = this._getCapValue(capabilities, CAP_IDS.FAN_MODE);
      if (fanMode !== null) {
        const fanStr = API_TO_FAN_MODE[parseInt(fanMode, 10)];
        if (fanStr) this._safeSetCapability('cozytouch_fan_mode', fanStr);
      }
    }

    if (this.hasCapability('cozytouch_swing_mode')) {
      const swingMode = this._getCapValue(capabilities, CAP_IDS.SWING_MODE);
      if (swingMode !== null) {
        const swingStr = API_TO_SWING_MODE[parseInt(swingMode, 10)];
        if (swingStr) this._safeSetCapability('cozytouch_swing_mode', swingStr);
      }
    }

    const minCapId = isCooling ? CAP_IDS.MIN_TEMP_COOL : CAP_IDS.MIN_TEMP_HEAT;
    const maxCapId = isCooling ? CAP_IDS.MAX_TEMP_COOL : CAP_IDS.MAX_TEMP_HEAT;
    const minTemp = this._getCapValue(capabilities, minCapId);
    const maxTemp = this._getCapValue(capabilities, maxCapId);
    if (minTemp !== null && maxTemp !== null) {
      this.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp), max: parseFloat(maxTemp),
      }).catch(this.error);
    }
  }

  // ── Overkiz polling ─────────────────────────────────────────────

  _updateFromOverkiz(states) {
    const currentTemp = this._getStateValue(states, STATES.TEMPERATURE);
    if (currentTemp !== null) this._safeSetCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = this._getStateValue(states, STATES.HEATING_TARGET_TEMP)
      || this._getStateValue(states, STATES.COMFORT_HEATING_TEMP);
    if (targetTemp !== null) this._safeSetCapability('target_temperature', parseFloat(targetTemp));

    const onOff = this._getStateValue(states, STATES.HEATING_ON_OFF)
      || this._getStateValue(states, STATES.ON_OFF);
    if (onOff !== null) {
      const isOn = onOff === 'on' || onOff === true || onOff === 1;
      this._safeSetCapability('onoff', isOn);
      this._safeSetCapability('cozytouch_hvac_mode', isOn ? 'heat' : 'off');
      this._currentHvacMode = isOn ? 'heat' : 'off';
    }
  }

}

module.exports = ClimateDevice;
