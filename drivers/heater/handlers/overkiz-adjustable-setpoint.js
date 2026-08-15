'use strict';

const {
  STATES,
  EXTRA_COMMANDS,
  ADJUSTABLE_SETPOINT_OPERATING_TO_MODE,
  MODE_TO_ADJUSTABLE_SETPOINT,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');
const { getAdjustableSetpointTemperatureSensorUrl } = require('../../../lib/helpers/overkiz-device');

/**
 * Overkiz handler for Atlantic electrical heaters with adjustable temperature
 * setpoint (controllable: AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint).
 *
 * Known product: Sauter/Thermor Ipala — kept under the heater driver because it is
 * still a radiator (temp + heating mode + onoff), unlike Pass Cozytouch / Zone Control.
 *
 * Writes use IO-accepted operating params: standby / basic / internal
 * (Homey maps them to off / manual / prog). Room temperature is read from linked
 * sensor endpoint #2, not from the main actuator.
 */
class AdjustableSetpointOverkizHandler {

  constructor(ctx) { this.ctx = ctx; }

  async _runModeCommand(mode) {
    const mapping = MODE_TO_ADJUSTABLE_SETPOINT[mode];
    if (!mapping) {
      throw new Error(`Unsupported heating mode: ${mode}`);
    }
    await this.ctx.executeCommand(mapping.command, [mapping.value]);
  }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(EXTRA_COMMANDS.SET_TARGET_TEMPERATURE, [value]);
  }

  async setOnOff(value) {
    await this._runModeCommand(value ? 'manual' : 'off');
    this.ctx.setCapability('cozytouch_heating_mode', value ? 'manual' : 'off');
    this.ctx.setCapability('onoff', value);
  }

  async setMode(mode) {
    await this._runModeCommand(mode);
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async _readLinkedTemperature() {
    const sensorUrl = getAdjustableSetpointTemperatureSensorUrl(this.ctx.deviceURL);
    if (!sensorUrl) return null;

    try {
      const sensorStates = await this.ctx.api.getDeviceState(sensorUrl);
      const temp = getStateValue(sensorStates, STATES.TEMPERATURE);
      if (temp === null || temp === undefined) return null;
      return parseFloat(temp);
    } catch (err) {
      this.ctx.log(`Linked temperature sensor unavailable: ${err.message}`);
      return null;
    }
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    const level = getStateValue(states, STATES.TARGET_HEATING_LEVEL);
    if (level === 'eco') {
      // Eco heating level is not exposed as a Homey mode on Ipala.
      this.ctx.setCapability('cozytouch_heating_mode', 'manual');
      this.ctx.setCapability('onoff', true);
    } else {
      const opMode = getStateValue(states, 'core:OperatingModeState');
      if (opMode !== null) {
        const modeStr = ADJUSTABLE_SETPOINT_OPERATING_TO_MODE[opMode] || 'manual';
        this.ctx.setCapability('cozytouch_heating_mode', modeStr);
        this.ctx.setCapability('onoff', modeStr !== 'off');
      } else {
        const onOff = getStateValue(states, STATES.ON_OFF);
        if (onOff !== null) {
          const isOn = onOff === 'on';
          this.ctx.setCapability('onoff', isOn);
          this.ctx.setCapability('cozytouch_heating_mode', isOn ? 'manual' : 'off');
        }
      }
    }

    const targetTemp = getStateValue(states, 'core:TargetTemperatureState')
      || getStateValue(states, STATES.HEATING_TARGET_TEMP);
    if (targetTemp !== null) {
      this.ctx.setCapability('target_temperature', parseFloat(targetTemp));
    }

    // Room temperature lives on linked sensor #2, not on the main actuator.
    const currentTemp = await this._readLinkedTemperature();
    if (currentTemp !== null && !Number.isNaN(currentTemp)) {
      this.ctx.setCapability('measure_temperature', currentTemp);
    }

    const minTemp = getStateValue(states, 'core:MinimumHeatingTargetTemperatureState');
    const maxTemp = getStateValue(states, STATES.MAX_HEATING_TEMP)
      || getStateValue(states, 'core:MaximumTargetTemperatureState');
    if (minTemp !== null && maxTemp !== null) {
      this.ctx.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp), max: parseFloat(maxTemp),
      });
    } else if (maxTemp !== null) {
      this.ctx.setCapabilityOptions('target_temperature', {
        min: 5, max: parseFloat(maxTemp),
      });
    }
  }

}

module.exports = AdjustableSetpointOverkizHandler;
