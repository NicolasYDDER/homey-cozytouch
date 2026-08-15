'use strict';

const {
  PASS_APC_STATES,
  PASS_APC_COMMANDS,
  PASS_APC_ZONE_MODE_TO_OVERKIZ,
  PASS_APC_OVERKIZ_TO_ZONE_MODE,
  STATES,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');
const { getPassAPCZoneTemperatureSensorUrl } = require('../../../lib/helpers/overkiz-device');

/**
 * Overkiz handler for Atlantic Pass APC heating/cooling zones
 * (AtlanticPassAPCHeatingAndCoolingZone — Shogun Zone Control 2.0 room circuits).
 *
 * Zone modes: off / manual / prog (Homey cozytouch_heating_mode).
 * Heat vs cool follows the global controller operating mode.
 * Homey capabilities follow Overkiz state on each poll — no cross-device commands.
 */
class PassAPCZoneOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  _mainDeviceURL() {
    return this.ctx.store.passApcMainDeviceURL
      || this.ctx.store.passApcMainDeviceUrl;
  }

  _sensorDeviceURL() {
    return this.ctx.store.passApcTemperatureSensorURL
      || getPassAPCZoneTemperatureSensorUrl(this.ctx.deviceURL);
  }

  async _getSystemOperatingMode() {
    const mainUrl = this._mainDeviceURL();
    if (!mainUrl) return 'heating';

    try {
      const states = await this.ctx.api.getDeviceState(mainUrl);
      return getStateValue(states, PASS_APC_STATES.OPERATING_MODE) || 'heating';
    } catch (err) {
      this.ctx.log(`Pass APC main controller unavailable: ${err.message}`);
      return 'heating';
    }
  }

  _isCooling(systemMode) {
    return systemMode === 'cooling' || systemMode === 'drying';
  }

  async setTargetTemperature(value) {
    const systemMode = await this._getSystemOperatingMode();
    const command = this._isCooling(systemMode)
      ? PASS_APC_COMMANDS.SET_COOLING_TARGET_TEMP
      : PASS_APC_COMMANDS.SET_HEATING_TARGET_TEMP;

    await this.ctx.executeCommand(command, [value]);
    await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_DEROGATION_ON_OFF, ['on']);
    this.ctx.setCapability('target_temperature', value);
  }

  async setOnOff(value) {
    await this.setMode(value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const overkizMode = PASS_APC_ZONE_MODE_TO_OVERKIZ[mode];
    if (!overkizMode) {
      throw new Error(`Unsupported zone mode: ${mode}`);
    }

    const systemMode = await this._getSystemOperatingMode();
    const isCooling = this._isCooling(systemMode);

    if (mode === 'off') {
      if (isCooling) {
        await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_COOLING_ON_OFF, ['off']);
        await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_COOLING_MODE, ['stop']);
      } else {
        await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_HEATING_ON_OFF, ['off']);
        await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_HEATING_MODE, ['stop']);
      }
    } else if (isCooling) {
      await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_COOLING_ON_OFF, ['on']);
      await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_COOLING_MODE, [overkizMode]);
    } else {
      await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_HEATING_ON_OFF, ['on']);
      await this.ctx.executeCommand(PASS_APC_COMMANDS.SET_HEATING_MODE, [overkizMode]);
    }

    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async _readLinkedTemperature() {
    const sensorUrl = this._sensorDeviceURL();
    if (!sensorUrl) return null;

    try {
      const sensorStates = await this.ctx.api.getDeviceState(sensorUrl);
      return getStateValue(sensorStates, STATES.TEMPERATURE);
    } catch (err) {
      this.ctx.log(`Linked zone temperature sensor unavailable: ${err.message}`);
      return null;
    }
  }

  _readZoneMode(states, systemMode) {
    if (this._isCooling(systemMode)) {
      const coolingOnOff = getStateValue(states, PASS_APC_STATES.COOLING_ON_OFF);
      const coolingMode = getStateValue(states, PASS_APC_STATES.COOLING_MODE);
      if (coolingOnOff === 'off' || coolingMode === 'stop') return 'off';
      return PASS_APC_OVERKIZ_TO_ZONE_MODE[coolingMode] || 'manual';
    }

    const heatingOnOff = getStateValue(states, PASS_APC_STATES.HEATING_ON_OFF);
    const heatingMode = getStateValue(states, PASS_APC_STATES.HEATING_MODE);
    if (heatingOnOff === 'off' || heatingMode === 'stop') return 'off';
    return PASS_APC_OVERKIZ_TO_ZONE_MODE[heatingMode] || 'manual';
  }

  _readTargetTemperature(states, systemMode) {
    if (this._isCooling(systemMode)) {
      return getStateValue(states, PASS_APC_STATES.COOLING_TARGET_TEMP)
        || getStateValue(states, PASS_APC_STATES.TARGET_TEMP);
    }
    return getStateValue(states, PASS_APC_STATES.HEATING_TARGET_TEMP)
      || getStateValue(states, PASS_APC_STATES.TARGET_TEMP);
  }

  _readTargetLimits(states, systemMode) {
    if (this._isCooling(systemMode)) {
      return {
        min: getStateValue(states, PASS_APC_STATES.MIN_COOLING_TARGET_TEMP),
        max: getStateValue(states, PASS_APC_STATES.MAX_COOLING_TARGET_TEMP),
      };
    }
    return {
      min: getStateValue(states, PASS_APC_STATES.MIN_HEATING_TARGET_TEMP),
      max: getStateValue(states, PASS_APC_STATES.MAX_HEATING_TARGET_TEMP),
    };
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();
    const systemMode = await this._getSystemOperatingMode();

    const zoneMode = this._readZoneMode(states, systemMode);
    this.ctx.setCapability('cozytouch_heating_mode', zoneMode);
    this.ctx.setCapability('onoff', zoneMode !== 'off');

    const targetTemp = this._readTargetTemperature(states, systemMode);
    if (targetTemp !== null) {
      this.ctx.setCapability('target_temperature', parseFloat(targetTemp));
    }

    let currentTemp = getStateValue(states, STATES.TEMPERATURE);
    if (currentTemp === null) {
      currentTemp = await this._readLinkedTemperature();
    }
    if (currentTemp !== null) {
      this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));
    }

    const { min, max } = this._readTargetLimits(states, systemMode);
    if (min !== null && max !== null) {
      this.ctx.setCapabilityOptions('target_temperature', {
        min: parseFloat(min), max: parseFloat(max), step: 0.5,
      });
    }
  }

}

module.exports = PassAPCZoneOverkizHandler;
