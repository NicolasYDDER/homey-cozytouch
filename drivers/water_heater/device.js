'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');

// Well-known capability IDs for water heaters
const CAP_IDS = {
  TARGET_TEMP: 2,
  CURRENT_TEMP: 7,
  HEATING_MODE: 1,
  ON_OFF: 3,
  AWAY_MODE: 10,        // Away mode switch
  MIN_TEMP: 160,
  MAX_TEMP: 161,
  BOOST: 5,             // Boost mode
  ECO: 6,               // Eco mode
};

const HEATING_MODE_TO_API = {
  off: null,
  manual: '0',
  eco_plus: '3',
  prog: '4',
};

const API_TO_HEATING_MODE = {
  0: 'manual',
  3: 'eco_plus',
  4: 'prog',
};

class WaterHeaterDevice extends CozyTouchDevice {

  _registerCapabilityListeners() {
    this.registerCapabilityListener('target_temperature', async (value) => {
      this.log(`Setting target temperature to ${value}`);
      await this._setCapValue(CAP_IDS.TARGET_TEMP, value);
    });

    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`Setting power to ${value ? 'ON' : 'OFF'}`);
      await this._setCapValue(CAP_IDS.ON_OFF, value ? '1' : '0');
      if (!value) {
        this._safeSetCapability('cozytouch_heating_mode', 'off');
      }
    });

    this.registerCapabilityListener('cozytouch_heating_mode', async (value) => {
      this.log(`Setting heating mode to ${value}`);
      await this.setHeatingMode(value);
    });

    this.registerCapabilityListener('cozytouch_away_mode', async (value) => {
      this.log(`Setting away mode to ${value ? 'ON' : 'OFF'}`);
      await this._setCapValue(CAP_IDS.AWAY_MODE, value ? '1' : '0');
    });
  }

  async setHeatingMode(mode) {
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
    this._safeSetCapability('cozytouch_heating_mode', mode);
  }

  _updateFromCapabilities(capabilities) {
    // Current temperature
    const currentTemp = this._getCapValue(capabilities, CAP_IDS.CURRENT_TEMP);
    if (currentTemp !== null) {
      this._safeSetCapability('measure_temperature', parseFloat(currentTemp));
    }

    // Target temperature
    const targetTemp = this._getCapValue(capabilities, CAP_IDS.TARGET_TEMP);
    if (targetTemp !== null) {
      this._safeSetCapability('target_temperature', parseFloat(targetTemp));
    }

    // On/Off
    const onOff = this._getCapValue(capabilities, CAP_IDS.ON_OFF);
    if (onOff !== null) {
      const isOn = onOff === '1' || onOff === 1 || onOff === true;
      this._safeSetCapability('onoff', isOn);
    }

    // Heating mode
    const mode = this._getCapValue(capabilities, CAP_IDS.HEATING_MODE);
    if (mode !== null) {
      const modeStr = API_TO_HEATING_MODE[parseInt(mode, 10)];
      if (modeStr) {
        const isOn = onOff === '1' || onOff === 1 || onOff === true;
        this._safeSetCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
      }
    }

    // Away mode
    const away = this._getCapValue(capabilities, CAP_IDS.AWAY_MODE);
    if (away !== null) {
      this._safeSetCapability('cozytouch_away_mode', away === '1' || away === 1 || away === true);
    }

    // Update temperature limits
    const minTemp = this._getCapValue(capabilities, CAP_IDS.MIN_TEMP);
    const maxTemp = this._getCapValue(capabilities, CAP_IDS.MAX_TEMP);
    if (minTemp !== null && maxTemp !== null) {
      this.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp),
        max: parseFloat(maxTemp),
      }).catch(this.error);
    }
  }

}

module.exports = WaterHeaterDevice;
