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
  AWAY_MODE: 10,
  MIN_TEMP: 160,
  MAX_TEMP: 161,
  BOOST: 5,
  ECO: 6,
};

const HEATING_MODE_TO_API = { off: null, manual: '0', eco_plus: '3', prog: '4' };
const API_TO_HEATING_MODE = { 0: 'manual', 3: 'eco_plus', 4: 'prog' };

// Overkiz DHW mode mapping
const OVERKIZ_DHW_TO_MODE = {
  manualEcoActive: 'eco_plus',
  manualEcoInactive: 'manual',
  autoMode: 'prog',
  boost: 'manual',
};
const MODE_TO_OVERKIZ_DHW = {
  manual: 'manualEcoInactive',
  eco_plus: 'manualEcoActive',
  prog: 'autoMode',
};

class WaterHeaterDevice extends CozyTouchDevice {

  _registerCapabilityListeners() {
    this.registerCapabilityListener('target_temperature', async (value) => {
      this.log(`Setting target temperature to ${value}`);
      if (this._protocol === 'overkiz') {
        await this._executeOverkizCommand(COMMANDS.SET_DHW_TEMP, [value]);
      } else {
        await this._setCapValue(CAP_IDS.TARGET_TEMP, value);
      }
    });

    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`Setting power to ${value ? 'ON' : 'OFF'}`);
      if (this._protocol === 'overkiz') {
        await this._executeOverkizCommand(COMMANDS.SET_DHW_ON_OFF, [value ? 'on' : 'off']);
      } else {
        await this._setCapValue(CAP_IDS.ON_OFF, value ? '1' : '0');
      }
      if (!value) this._safeSetCapability('cozytouch_heating_mode', 'off');
    });

    this.registerCapabilityListener('cozytouch_heating_mode', async (value) => {
      this.log(`Setting heating mode to ${value}`);
      await this.setHeatingMode(value);
    });

    this.registerCapabilityListener('cozytouch_away_mode', async (value) => {
      this.log(`Setting away mode to ${value ? 'ON' : 'OFF'}`);
      if (this._protocol === 'overkiz') {
        if (value) {
          await this._executeOverkizCommand(COMMANDS.SET_ABSENCE_MODE, ['on']);
        } else {
          await this._executeOverkizCommand(COMMANDS.CANCEL_ABSENCE, []);
        }
      } else {
        await this._setCapValue(CAP_IDS.AWAY_MODE, value ? '1' : '0');
      }
    });
  }

  async setHeatingMode(mode) {
    if (this._protocol === 'overkiz') {
      if (mode === 'off') {
        await this._executeOverkizCommand(COMMANDS.SET_DHW_ON_OFF, ['off']);
        this._safeSetCapability('onoff', false);
      } else {
        await this._executeOverkizCommand(COMMANDS.SET_DHW_ON_OFF, ['on']);
        this._safeSetCapability('onoff', true);
        const dhwMode = MODE_TO_OVERKIZ_DHW[mode];
        if (dhwMode) {
          await this._executeOverkizCommand(COMMANDS.SET_DHW_MODE, [dhwMode]);
        }
      }
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

  // ── CozyTouch polling ───────────────────────────────────────────

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

    const away = this._getCapValue(capabilities, CAP_IDS.AWAY_MODE);
    if (away !== null) {
      this._safeSetCapability('cozytouch_away_mode', away === '1' || away === 1 || away === true);
    }

    const minTemp = this._getCapValue(capabilities, CAP_IDS.MIN_TEMP);
    const maxTemp = this._getCapValue(capabilities, CAP_IDS.MAX_TEMP);
    if (minTemp !== null && maxTemp !== null) {
      this.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp), max: parseFloat(maxTemp),
      }).catch(this.error);
    }
  }

  // ── Overkiz polling ─────────────────────────────────────────────

  _updateFromOverkiz(states) {
    // Current temperature (try multiple state names)
    const currentTemp = this._getStateValue(states, STATES.DHW_TEMP)
      || this._getStateValue(states, STATES.MIDDLE_WATER_TEMP)
      || this._getStateValue(states, STATES.BOTTOM_WATER_TEMP)
      || this._getStateValue(states, STATES.TEMPERATURE);
    if (currentTemp !== null) this._safeSetCapability('measure_temperature', parseFloat(currentTemp));

    // Target temperature
    const targetTemp = this._getStateValue(states, STATES.TARGET_DHW_TEMP)
      || this._getStateValue(states, STATES.COMFORT_DHW_TEMP)
      || this._getStateValue(states, STATES.WATER_TARGET_TEMP);
    if (targetTemp !== null) this._safeSetCapability('target_temperature', parseFloat(targetTemp));

    // On/Off
    const onOff = this._getStateValue(states, STATES.DHW_ON_OFF)
      || this._getStateValue(states, STATES.ON_OFF);
    if (onOff !== null) {
      const isOn = onOff === 'on' || onOff === true || onOff === 1;
      this._safeSetCapability('onoff', isOn);
    }

    // DHW mode
    const dhwMode = this._getStateValue(states, STATES.DHW_MODE);
    if (dhwMode !== null) {
      const modeStr = OVERKIZ_DHW_TO_MODE[dhwMode] || 'manual';
      const isOn = onOff === 'on' || onOff === true || onOff === 1 || onOff === null;
      this._safeSetCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
    }

    // Away mode
    const absence = this._getStateValue(states, STATES.DHW_ABSENCE);
    if (absence !== null) {
      this._safeSetCapability('cozytouch_away_mode', absence === 'on' || absence === true || absence === 1);
    }

    // Boost mode (read only for now)
    const boost = this._getStateValue(states, STATES.DHW_BOOST);
    if (boost !== null) {
      this.log(`Boost mode: ${boost}`);
    }
  }

}

module.exports = WaterHeaterDevice;
