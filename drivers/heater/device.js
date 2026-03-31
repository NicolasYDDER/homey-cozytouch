'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
// Well-known capability IDs for heaters/boilers
// These are dynamically discovered but we use common patterns
const CAP_IDS = {
  TARGET_TEMP: 2,       // Target temperature setpoint
  CURRENT_TEMP: 7,      // Current measured temperature
  HEATING_MODE: 1,      // Heating mode (off/manual/eco_plus/prog)
  ON_OFF: 3,            // On/Off switch
  MIN_TEMP: 160,        // Min temperature limit
  MAX_TEMP: 161,        // Max temperature limit
};

// Reverse map: heating mode string -> API integer
const HEATING_MODE_TO_API = {
  off: null,     // off is handled via ON_OFF
  manual: '0',
  eco_plus: '3',
  prog: '4',
};

const API_TO_HEATING_MODE = {
  0: 'manual',
  3: 'eco_plus',
  4: 'prog',
};

class HeaterDevice extends CozyTouchDevice {

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
  }

  async setHeatingMode(mode) {
    if (mode === 'off') {
      await this._setCapValue(CAP_IDS.ON_OFF, '0');
      this._safeSetCapability('onoff', false);
    } else {
      // Ensure device is on
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
      this._safeSetCapability('onoff', onOff === '1' || onOff === 1 || onOff === true);
    }

    // Heating mode
    const mode = this._getCapValue(capabilities, CAP_IDS.HEATING_MODE);
    if (mode !== null) {
      const modeStr = API_TO_HEATING_MODE[parseInt(mode, 10)];
      if (modeStr) {
        // If device is off, override to 'off'
        const isOn = onOff === '1' || onOff === 1 || onOff === true;
        this._safeSetCapability('cozytouch_heating_mode', isOn ? modeStr : 'off');
      }
    }

    // Update temperature limits from capabilities
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

module.exports = HeaterDevice;
