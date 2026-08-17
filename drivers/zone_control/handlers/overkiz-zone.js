'use strict';

const {
  ZONE_CONTROL_STATES,
  ZONE_CONTROL_COMMANDS,
  ZONE_CONTROL_ZONE_MODE_TO_OVERKIZ,
  ZONE_CONTROL_OVERKIZ_TO_ZONE_MODE,
  ZONE_CONTROL_OPERATING_TO_HVAC,
  STATES,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');
const { getZoneControlZoneTemperatureSensorUrl } = require('../../../lib/helpers/overkiz-device');

/**
 * Overkiz handler for Shogun Zone Control heating/cooling zones
 * (AtlanticPassAPCHeatingAndCoolingZone — room circuits).
 *
 * Zone modes: off / manual / prog (Homey cozytouch_heating_mode).
 * Heat vs cool follows the global controller, mirrored to native
 * thermostat_mode (Homey defaults) so tiles use cool (blue) vs heat (orange).
 * `dry` is exposed as `cool` for tile colors. Homey capabilities follow Overkiz
 * state on each poll — no cross-device commands except reading the controller.
 */
class ZoneOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  _mainDeviceURL() {
    return this.ctx.store.zoneControlMainDeviceURL
      || this.ctx.store.passApcMainDeviceURL
      || this.ctx.store.passApcMainDeviceUrl;
  }

  _sensorDeviceURL() {
    return this.ctx.store.zoneControlTemperatureSensorURL
      || this.ctx.store.passApcTemperatureSensorURL
      || getZoneControlZoneTemperatureSensorUrl(this.ctx.deviceURL);
  }

  async _getMainStates() {
    const mainUrl = this._mainDeviceURL();
    if (!mainUrl) return null;
    try {
      return await this.ctx.api.getDeviceState(mainUrl);
    } catch (err) {
      this.ctx.log(`Zone Control main controller unavailable: ${err.message}`);
      return null;
    }
  }

  async _getSystemOperatingMode() {
    const states = await this._getMainStates();
    if (!states) return 'heating';
    return getStateValue(states, ZONE_CONTROL_STATES.OPERATING_MODE) || 'heating';
  }

  /**
   * Map controller state → Homey thermostat_mode (heat|cool|auto|off).
   * `dry` is exposed as `cool` so the tile uses cooling colors.
   */
  _thermostatModeFromMainStates(states) {
    if (!states) return 'heat';
    const autoSwitch = getStateValue(states, ZONE_CONTROL_STATES.AUTO_SWITCH);
    if (autoSwitch === 'on') return 'auto';
    const operatingMode = getStateValue(states, ZONE_CONTROL_STATES.OPERATING_MODE);
    const hvac = ZONE_CONTROL_OPERATING_TO_HVAC[operatingMode] || 'off';
    if (hvac === 'dry') return 'cool';
    return hvac;
  }

  _isCooling(systemMode) {
    return systemMode === 'cooling' || systemMode === 'drying';
  }

  async setTargetTemperature(value) {
    const systemMode = await this._getSystemOperatingMode();
    const command = this._isCooling(systemMode)
      ? ZONE_CONTROL_COMMANDS.SET_COOLING_TARGET_TEMP
      : ZONE_CONTROL_COMMANDS.SET_HEATING_TARGET_TEMP;

    await this.ctx.executeCommand(command, [value]);
    await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_DEROGATION_ON_OFF, ['on']);
    this.ctx.setCapability('target_temperature', value);
  }

  async setOnOff(value) {
    await this.setMode(value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const overkizMode = ZONE_CONTROL_ZONE_MODE_TO_OVERKIZ[mode];
    if (!overkizMode) {
      throw new Error(`Unsupported zone mode: ${mode}`);
    }

    const systemMode = await this._getSystemOperatingMode();
    const isCooling = this._isCooling(systemMode);

    if (mode === 'off') {
      if (isCooling) {
        await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_COOLING_ON_OFF, ['off']);
        await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_COOLING_MODE, ['stop']);
      } else {
        await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_HEATING_ON_OFF, ['off']);
        await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_HEATING_MODE, ['stop']);
      }
    } else if (isCooling) {
      await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_COOLING_ON_OFF, ['on']);
      await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_COOLING_MODE, [overkizMode]);
    } else {
      await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_HEATING_ON_OFF, ['on']);
      await this.ctx.executeCommand(ZONE_CONTROL_COMMANDS.SET_HEATING_MODE, [overkizMode]);
    }

    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
    if (this.ctx.hasCapability('thermostat_mode')) {
      if (mode === 'off') {
        this.ctx.setCapability('thermostat_mode', 'off');
      } else {
        const mainStates = await this._getMainStates();
        this.ctx.setCapability(
          'thermostat_mode',
          this._thermostatModeFromMainStates(mainStates),
        );
      }
    }
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
      const coolingOnOff = getStateValue(states, ZONE_CONTROL_STATES.COOLING_ON_OFF);
      const coolingMode = getStateValue(states, ZONE_CONTROL_STATES.COOLING_MODE);
      if (coolingOnOff === 'off' || coolingMode === 'stop') return 'off';
      return ZONE_CONTROL_OVERKIZ_TO_ZONE_MODE[coolingMode] || 'manual';
    }

    const heatingOnOff = getStateValue(states, ZONE_CONTROL_STATES.HEATING_ON_OFF);
    const heatingMode = getStateValue(states, ZONE_CONTROL_STATES.HEATING_MODE);
    if (heatingOnOff === 'off' || heatingMode === 'stop') return 'off';
    return ZONE_CONTROL_OVERKIZ_TO_ZONE_MODE[heatingMode] || 'manual';
  }

  _readTargetTemperature(states, systemMode) {
    if (this._isCooling(systemMode)) {
      return getStateValue(states, ZONE_CONTROL_STATES.COOLING_TARGET_TEMP)
        || getStateValue(states, ZONE_CONTROL_STATES.TARGET_TEMP);
    }
    return getStateValue(states, ZONE_CONTROL_STATES.HEATING_TARGET_TEMP)
      || getStateValue(states, ZONE_CONTROL_STATES.TARGET_TEMP);
  }

  _readTargetLimits(states, systemMode) {
    if (this._isCooling(systemMode)) {
      return {
        min: getStateValue(states, ZONE_CONTROL_STATES.MIN_COOLING_TARGET_TEMP),
        max: getStateValue(states, ZONE_CONTROL_STATES.MAX_COOLING_TARGET_TEMP),
      };
    }
    return {
      min: getStateValue(states, ZONE_CONTROL_STATES.MIN_HEATING_TARGET_TEMP),
      max: getStateValue(states, ZONE_CONTROL_STATES.MAX_HEATING_TARGET_TEMP),
    };
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();
    const mainStates = await this._getMainStates();
    const systemMode = getStateValue(mainStates, ZONE_CONTROL_STATES.OPERATING_MODE) || 'heating';

    const zoneMode = this._readZoneMode(states, systemMode);
    this.ctx.setCapability('cozytouch_heating_mode', zoneMode);
    this.ctx.setCapability('onoff', zoneMode !== 'off');

    // Tile heat/cool colors: follow controller, but zone off → thermostat off (no blue/orange active)
    if (this.ctx.hasCapability('thermostat_mode')) {
      const systemThermostat = this._thermostatModeFromMainStates(mainStates);
      this.ctx.setCapability(
        'thermostat_mode',
        zoneMode === 'off' ? 'off' : systemThermostat,
      );
    }

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

module.exports = ZoneOverkizHandler;
