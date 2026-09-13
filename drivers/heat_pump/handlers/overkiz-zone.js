'use strict';

const {
  PASS_APC_STATES,
  PASS_APC_COMMANDS,
  PASS_APC_OPERATING_TO_HVAC,
  PASS_APC_ZONE_MODE_TO_OVERKIZ,
  PASS_APC_OVERKIZ_TO_ZONE_MODE,
  STATES,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');
const { pickCommand } = require('../../../lib/helpers/overkiz-commands');

/**
 * Overkiz handler for one heating circuit of a Pass APC heat pump
 * (a floor circuit, a radiator circuit, a room…).
 *
 * Circuit modes are off / manual / prog (Homey cozytouch_heating_mode). Whether
 * the circuit is heating or cooling is decided by the main unit, so its state is
 * read from there and mirrored to thermostat_mode for the tile colors when the
 * product can cool. Setpoint and mode command names differ per product, so they
 * are taken from what the circuit advertises (store.overkizCommands).
 */
class HeatPumpZoneOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  _command(candidates, { required = true } = {}) {
    const name = pickCommand(this.ctx.store.overkizCommands, candidates);
    if (!name && required) {
      throw new Error(`This circuit accepts none of these commands: ${candidates.join(', ')}`);
    }
    return name;
  }

  async _getMainStates() {
    const mainUrl = this.ctx.store.passApcMainDeviceURL;
    if (!mainUrl) return null;

    try {
      return await this.ctx.api.getDeviceState(mainUrl);
    } catch (err) {
      this.ctx.log(`Heat pump main unit unavailable: ${err.message}`);
      return null;
    }
  }

  /** heating | cooling | drying | stop — the mode the whole heat pump runs in. */
  async _getSystemOperatingMode() {
    const states = await this._getMainStates();
    if (!states) return 'heating';
    return getStateValue(states, PASS_APC_STATES.OPERATING_MODE) || 'heating';
  }

  _isCooling(systemMode) {
    return systemMode === 'cooling' || systemMode === 'drying';
  }

  /** Main unit state → Homey thermostat_mode. `dry` shows as cool (tile colors). */
  _thermostatModeFromMainStates(states) {
    if (!states) return 'heat';
    if (getStateValue(states, PASS_APC_STATES.AUTO_SWITCH) === 'on') return 'auto';
    const hvac = PASS_APC_OPERATING_TO_HVAC[getStateValue(states, PASS_APC_STATES.OPERATING_MODE)]
      || 'off';
    return hvac === 'dry' ? 'cool' : hvac;
  }

  async setTargetTemperature(value) {
    const systemMode = await this._getSystemOperatingMode();
    const command = this._isCooling(systemMode)
      ? this._command([
        PASS_APC_COMMANDS.SET_COOLING_TARGET_TEMP,
        PASS_APC_COMMANDS.SET_DEROGATED_TARGET_TEMP,
        PASS_APC_COMMANDS.SET_TARGET_TEMP,
      ])
      : this._command([
        PASS_APC_COMMANDS.SET_HEATING_TARGET_TEMP,
        PASS_APC_COMMANDS.SET_DEROGATED_TARGET_TEMP,
        PASS_APC_COMMANDS.SET_TARGET_TEMP,
      ]);

    await this.ctx.executeCommand(command, [value]);

    // A setpoint sent while the circuit follows its schedule is a derogation:
    // without this the heat pump reverts to the programmed value.
    const derogation = this._command([PASS_APC_COMMANDS.SET_DEROGATION_ON_OFF], { required: false });
    if (derogation) {
      await this.ctx.executeCommand(derogation, ['on']);
    }

    this.ctx.setCapability('target_temperature', value);
  }

  async setOnOff(value) {
    await this.setMode(value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const overkizMode = PASS_APC_ZONE_MODE_TO_OVERKIZ[mode];
    if (!overkizMode) {
      throw new Error(`Unsupported circuit mode: ${mode}`);
    }

    const systemMode = await this._getSystemOperatingMode();
    const isCooling = this._isCooling(systemMode);

    const onOff = isCooling
      ? this._command([PASS_APC_COMMANDS.SET_COOLING_ON_OFF], { required: false })
      : this._command([PASS_APC_COMMANDS.SET_HEATING_ON_OFF], { required: false });
    const modeCommand = isCooling
      ? this._command([PASS_APC_COMMANDS.SET_COOLING_MODE])
      : this._command([PASS_APC_COMMANDS.SET_HEATING_MODE]);

    if (onOff) {
      await this.ctx.executeCommand(onOff, [mode === 'off' ? 'off' : 'on']);
    }
    await this.ctx.executeCommand(modeCommand, [overkizMode]);

    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');

    if (this.ctx.hasCapability('thermostat_mode')) {
      if (mode === 'off') {
        this.ctx.setCapability('thermostat_mode', 'off');
      } else {
        this.ctx.setCapability(
          'thermostat_mode',
          this._thermostatModeFromMainStates(await this._getMainStates()),
        );
      }
    }
  }

  /** Room temperature, from the circuit probe linked at pairing time. */
  async _readLinkedTemperature() {
    const sensorUrl = this.ctx.store.passApcTemperatureSensorURL;
    if (!sensorUrl) return null;

    try {
      const sensorStates = await this.ctx.api.getDeviceState(sensorUrl);
      return getStateValue(sensorStates, STATES.TEMPERATURE);
    } catch (err) {
      this.ctx.log(`Circuit temperature probe unavailable: ${err.message}`);
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

  // Which state holds the setpoint depends on the product and on whether the
  // circuit currently runs a derogation, hence the fallbacks.
  _readTargetTemperature(states, systemMode) {
    if (this._isCooling(systemMode)) {
      return getStateValue(states, PASS_APC_STATES.COOLING_TARGET_TEMP)
        || getStateValue(states, PASS_APC_STATES.DEROGATED_TARGET_TEMP)
        || getStateValue(states, PASS_APC_STATES.TARGET_TEMP);
    }
    return getStateValue(states, PASS_APC_STATES.HEATING_TARGET_TEMP)
      || getStateValue(states, PASS_APC_STATES.DEROGATED_TARGET_TEMP)
      || getStateValue(states, PASS_APC_STATES.TARGET_TEMP)
      || getStateValue(states, PASS_APC_STATES.COMFORT_HEATING_TARGET_TEMP);
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

  /**
   * Narrow the slider to what the circuit declares — but only when the values
   * can be a setpoint range. A circuit of an unmapped product may report
   * something else entirely under those states, and a nonsense range locks the
   * slider (same trap as the water heater limits in 1.3.6).
   */
  _applyTargetLimits(states, systemMode) {
    const { min, max } = this._readTargetLimits(states, systemMode);
    const low = parseFloat(min);
    const high = parseFloat(max);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return;
    if (low >= high || low < 5 || high > 60) {
      this.ctx.log(`Ignoring implausible setpoint range from the circuit: ${low}–${high}`);
      return;
    }
    this.ctx.setCapabilityOptions('target_temperature', { min: low, max: high, step: 0.5 });
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();
    const mainStates = await this._getMainStates();
    const systemMode = getStateValue(mainStates, PASS_APC_STATES.OPERATING_MODE) || 'heating';

    const zoneMode = this._readZoneMode(states, systemMode);
    this.ctx.setCapability('cozytouch_heating_mode', zoneMode);
    this.ctx.setCapability('onoff', zoneMode !== 'off');

    if (this.ctx.hasCapability('thermostat_mode')) {
      this.ctx.setCapability(
        'thermostat_mode',
        zoneMode === 'off' ? 'off' : this._thermostatModeFromMainStates(mainStates),
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

    this._applyTargetLimits(states, systemMode);
  }

}

module.exports = HeatPumpZoneOverkizHandler;
