'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');

// Well-known capability IDs for climate devices (heat pumps, AC)
const CAP_IDS = {
  HVAC_MODE: 1,            // HVAC mode control
  TARGET_TEMP_HEAT: 2,     // Target temp for heating
  TARGET_TEMP_COOL: 8,     // Target temp for cooling
  ON_OFF: 3,               // On/Off
  CURRENT_TEMP: 7,         // Current temperature
  FAN_MODE: 4,             // Fan speed
  SWING_MODE: 9,           // Swing position
  QUIET_MODE: 11,          // Quiet mode
  BOOST: 5,                // Boost mode
  ECO: 6,                  // Eco mode
  PROG: 12,                // Program mode
  PROG_OVERRIDE: 13,       // Program override
  ACTIVITY: 14,            // Activity indicator
  MIN_TEMP_HEAT: 160,      // Min heating temp
  MAX_TEMP_HEAT: 161,      // Max heating temp
  MIN_TEMP_COOL: 162,      // Min cooling temp
  MAX_TEMP_COOL: 163,      // Max cooling temp
};

// HVAC mode string to API value defaults (varies per model - see store.hvacModes)

// Fan mode mapping
const FAN_MODE_TO_API = {
  auto: '0',
  low: '1',
  medium: '2',
  high: '3',
};

const API_TO_FAN_MODE = {
  0: 'auto',
  1: 'low',
  2: 'medium',
  3: 'high',
};

// Swing mode mapping
const SWING_MODE_TO_API = {
  up: '0',
  middle_up: '1',
  middle_down: '2',
  down: '3',
};

const API_TO_SWING_MODE = {
  0: 'up',
  1: 'middle_up',
  2: 'middle_down',
  3: 'down',
};

class ClimateDevice extends CozyTouchDevice {

  async onInit() {
    // Load HVAC mode mappings from store before parent init
    const store = this.getStore();
    this._hvacModes = store.hvacModes || CozyTouchAPI.HVAC_MODES.default;
    this._deviceType = store.deviceType || 'UNKNOWN';

    // Build reverse HVAC map (string -> API int) for this specific model
    this._hvacModeToApi = {};
    for (const [apiVal, modeStr] of Object.entries(this._hvacModes)) {
      this._hvacModeToApi[modeStr] = parseInt(apiVal, 10);
    }

    this._currentHvacMode = 'off';

    await super.onInit();
  }

  _registerCapabilityListeners() {
    this.registerCapabilityListener('target_temperature', async (value) => {
      this.log(`Setting target temperature to ${value}`);
      // Use cooling target when in cool/dry mode, otherwise heating target
      const capId = (this._currentHvacMode === 'cool' || this._currentHvacMode === 'dry')
        ? CAP_IDS.TARGET_TEMP_COOL
        : CAP_IDS.TARGET_TEMP_HEAT;
      await this._setCapValue(capId, value);
    });

    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`Setting power to ${value ? 'ON' : 'OFF'}`);
      if (!value) {
        await this._setCapValue(CAP_IDS.HVAC_MODE, '0'); // OFF
        this._safeSetCapability('cozytouch_hvac_mode', 'off');
      } else {
        // Turn on to last known non-off mode or default to 'heat'
        const mode = this._currentHvacMode !== 'off' ? this._currentHvacMode : 'heat';
        const apiVal = this._hvacModeToApi[mode];
        if (apiVal !== undefined) {
          await this._setCapValue(CAP_IDS.HVAC_MODE, String(apiVal));
          this._safeSetCapability('cozytouch_hvac_mode', mode);
        }
      }
    });

    this.registerCapabilityListener('cozytouch_hvac_mode', async (value) => {
      this.log(`Setting HVAC mode to ${value}`);
      await this.setHvacMode(value);
    });

    // Fan mode (AC only)
    if (this.hasCapability('cozytouch_fan_mode')) {
      this.registerCapabilityListener('cozytouch_fan_mode', async (value) => {
        this.log(`Setting fan mode to ${value}`);
        const apiVal = FAN_MODE_TO_API[value];
        if (apiVal !== undefined) {
          await this._setCapValue(CAP_IDS.FAN_MODE, apiVal);
        }
      });
    }

    // Swing mode (AC only)
    if (this.hasCapability('cozytouch_swing_mode')) {
      this.registerCapabilityListener('cozytouch_swing_mode', async (value) => {
        this.log(`Setting swing mode to ${value}`);
        const apiVal = SWING_MODE_TO_API[value];
        if (apiVal !== undefined) {
          await this._setCapValue(CAP_IDS.SWING_MODE, apiVal);
        }
      });
    }
  }

  async setHvacMode(mode) {
    const apiVal = this._hvacModeToApi[mode];
    if (apiVal !== undefined) {
      await this._setCapValue(CAP_IDS.HVAC_MODE, String(apiVal));
      this._currentHvacMode = mode;
      this._safeSetCapability('cozytouch_hvac_mode', mode);
      this._safeSetCapability('onoff', mode !== 'off');
    }
  }

  _updateFromCapabilities(capabilities) {
    // Current temperature
    const currentTemp = this._getCapValue(capabilities, CAP_IDS.CURRENT_TEMP);
    if (currentTemp !== null) {
      this._safeSetCapability('measure_temperature', parseFloat(currentTemp));
    }

    // HVAC mode
    const hvacMode = this._getCapValue(capabilities, CAP_IDS.HVAC_MODE);
    if (hvacMode !== null) {
      const modeInt = parseInt(hvacMode, 10);
      const modeStr = this._hvacModes[modeInt];
      if (modeStr) {
        this._currentHvacMode = modeStr;
        this._safeSetCapability('cozytouch_hvac_mode', modeStr);
        this._safeSetCapability('onoff', modeStr !== 'off');
      }
    }

    // Target temperature (depends on mode)
    const isCooling = this._currentHvacMode === 'cool' || this._currentHvacMode === 'dry';
    const targetCapId = isCooling ? CAP_IDS.TARGET_TEMP_COOL : CAP_IDS.TARGET_TEMP_HEAT;
    const targetTemp = this._getCapValue(capabilities, targetCapId);
    if (targetTemp !== null) {
      this._safeSetCapability('target_temperature', parseFloat(targetTemp));
    }

    // Fan mode (AC only)
    if (this.hasCapability('cozytouch_fan_mode')) {
      const fanMode = this._getCapValue(capabilities, CAP_IDS.FAN_MODE);
      if (fanMode !== null) {
        const fanStr = API_TO_FAN_MODE[parseInt(fanMode, 10)];
        if (fanStr) {
          this._safeSetCapability('cozytouch_fan_mode', fanStr);
        }
      }
    }

    // Swing mode (AC only)
    if (this.hasCapability('cozytouch_swing_mode')) {
      const swingMode = this._getCapValue(capabilities, CAP_IDS.SWING_MODE);
      if (swingMode !== null) {
        const swingStr = API_TO_SWING_MODE[parseInt(swingMode, 10)];
        if (swingStr) {
          this._safeSetCapability('cozytouch_swing_mode', swingStr);
        }
      }
    }

    // Update temperature limits
    const minCapId = isCooling ? CAP_IDS.MIN_TEMP_COOL : CAP_IDS.MIN_TEMP_HEAT;
    const maxCapId = isCooling ? CAP_IDS.MAX_TEMP_COOL : CAP_IDS.MAX_TEMP_HEAT;
    const minTemp = this._getCapValue(capabilities, minCapId);
    const maxTemp = this._getCapValue(capabilities, maxCapId);
    if (minTemp !== null && maxTemp !== null) {
      this.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp),
        max: parseFloat(maxTemp),
      }).catch(this.error);
    }
  }

}

module.exports = ClimateDevice;
