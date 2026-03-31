'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const OverkizAPI = require('../../lib/OverkizAPI');

const { STATES, COMMANDS } = OverkizAPI;

// CozyTouch (Magellan) capability IDs for towel racks
// Note: Towel racks do NOT have a separate on/off (cap 3). On/off is
// controlled through the heating mode (cap 1): value "off" turns it off.
const CAP_IDS = {
  HEATING_MODE: 1,
  TARGET_TEMP: 2,
  CURRENT_TEMP: 7,
  MIN_TEMP: 160,
  MAX_TEMP: 161,
};

// CozyTouch heating mode values - "off" is a valid mode value (not a separate capability)
const HEATING_MODE_TO_API = { off: '0', manual: '1', eco_plus: '3', prog: '4' };
const API_TO_HEATING_MODE = { 0: 'off', 1: 'manual', 3: 'eco_plus', 4: 'prog' };

// Overkiz Atlantic towel dryers use setHeatingLevel only
const MODE_TO_OVERKIZ_LEVEL = { off: 'off', manual: 'comfort', eco_plus: 'eco', prog: 'comfort' };
const OVERKIZ_LEVEL_TO_MODE = { off: 'off', comfort: 'manual', eco: 'eco_plus', frostprotection: 'off' };

class TowelRackDevice extends CozyTouchDevice {

  async onInit() {
    this._capabilitiesLogged = false;
    await super.onInit();
  }

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
        const level = value ? 'comfort' : 'off';
        await this._executeOverkizCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
      } else {
        // CozyTouch towel racks: on/off via heating mode
        const modeValue = value ? '1' : '0'; // 1=manual, 0=off
        await this._setCapValue(CAP_IDS.HEATING_MODE, modeValue);
      }
      this._safeSetCapability('cozytouch_heating_mode', value ? 'manual' : 'off');
    });

    this.registerCapabilityListener('cozytouch_heating_mode', async (value) => {
      this.log(`Setting heating mode to ${value}`);
      await this.setHeatingMode(value);
    });
  }

  async setHeatingMode(mode) {
    if (this._protocol === 'overkiz') {
      const level = MODE_TO_OVERKIZ_LEVEL[mode] || 'off';
      await this._executeOverkizCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
    } else {
      // CozyTouch towel racks: all modes go through heating mode capability
      const apiValue = HEATING_MODE_TO_API[mode];
      if (apiValue !== undefined) {
        await this._setCapValue(CAP_IDS.HEATING_MODE, apiValue);
      }
    }
    this._safeSetCapability('cozytouch_heating_mode', mode);
    this._safeSetCapability('onoff', mode !== 'off');
  }

  _updateFromCozytouch(capabilities) {
    // Log available capabilities once for debugging
    if (!this._capabilitiesLogged) {
      this._capabilitiesLogged = true;
      this.log('Available CozyTouch capabilities:', JSON.stringify(
        capabilities.map((c) => ({ id: c.capabilityId, name: c.name, value: c.value })),
      ));
    }

    const currentTemp = this._getCapValue(capabilities, CAP_IDS.CURRENT_TEMP);
    if (currentTemp !== null) this._safeSetCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = this._getCapValue(capabilities, CAP_IDS.TARGET_TEMP);
    if (targetTemp !== null) this._safeSetCapability('target_temperature', parseFloat(targetTemp));

    // Heating mode controls both mode and on/off for towel racks
    const mode = this._getCapValue(capabilities, CAP_IDS.HEATING_MODE);
    if (mode !== null) {
      const modeInt = parseInt(mode, 10);
      const modeStr = API_TO_HEATING_MODE[modeInt] || 'off';
      this._safeSetCapability('cozytouch_heating_mode', modeStr);
      this._safeSetCapability('onoff', modeStr !== 'off');
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
    // Log available states once for debugging
    if (!this._capabilitiesLogged) {
      this._capabilitiesLogged = true;
      this.log('Available Overkiz states:', JSON.stringify(
        (states || []).map((s) => ({ name: s.name, value: s.value })),
      ));
    }

    const temp = this._getStateValue(states, STATES.TEMPERATURE)
      || this._getStateValue(states, 'core:ComfortRoomTemperatureState');
    if (temp !== null) this._safeSetCapability('measure_temperature', parseFloat(temp));

    const targetTemp = this._getStateValue(states, 'core:TargetTemperatureState')
      || this._getStateValue(states, STATES.COMFORT_HEATING_TEMP);
    if (targetTemp !== null) this._safeSetCapability('target_temperature', parseFloat(targetTemp));

    const level = this._getStateValue(states, STATES.TARGET_HEATING_LEVEL);
    if (level !== null) {
      const modeStr = OVERKIZ_LEVEL_TO_MODE[level] || 'manual';
      this._safeSetCapability('cozytouch_heating_mode', modeStr);
      this._safeSetCapability('onoff', modeStr !== 'off');
    } else {
      const onOff = this._getStateValue(states, STATES.ON_OFF);
      if (onOff !== null) {
        const isOn = onOff === 'on' || onOff === true || onOff === 1;
        this._safeSetCapability('onoff', isOn);
      }
    }
  }

}

module.exports = TowelRackDevice;
