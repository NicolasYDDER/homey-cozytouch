'use strict';

const {
  STATES,
  EXTRA_COMMANDS,
  ADJUSTABLE_SETPOINT_STATES,
  ADJUSTABLE_SETPOINT_OPERATING_TO_MODE,
  MODE_TO_ADJUSTABLE_SETPOINT,
  PASS_COZYTOUCH_LEVELS,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');
const {
  getAdjustableSetpointTemperatureSensorUrl,
  isElectricEnergySensor,
  findStackSibling,
} = require('../../../lib/helpers/overkiz-device');
const { pickCommand } = require('../../../lib/helpers/overkiz-commands');
const {
  ScheduleError,
  resolveDays,
  parsePeriods,
  applyPeriods,
} = require('../../../lib/helpers/time-program');
const { PendingWrites } = require('../../../lib/helpers/pending-writes');

/** A heating mode this radiator has no command for. */
class UnsupportedModeError extends Error {}

function toNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

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
 *
 * The cloud keeps reporting the state from before a command for up to a minute,
 * so what was just written is held on the tiles until the radiator agrees
 * (PendingWrites) instead of flipping back at the next poll.
 *
 * Beyond the mode and the setpoint it reads:
 *   - the level the radiator is applying right now (comfort / eco / …), which is
 *     what tells a programmed radiator's comfort period from its eco one;
 *   - its consumption: a cumulated energy counter on a sibling endpoint, and an
 *     estimate of the instantaneous power from the rated power and the share of
 *     time the element is on.
 * and it rewrites the weekly comfort periods (setComfortPeriods).
 *
 * The energy and level tiles are added the first time the radiator reports the
 * data behind them, rather than at pairing: that covers radiators paired by an
 * earlier version, and a unit that reports none of it never gets an empty tile.
 */
class AdjustableSetpointOverkizHandler {

  constructor(ctx) {
    this.ctx = ctx;
    this._logged = new Set();
    this._writes = new PendingWrites({ log: (line) => ctx.log(line) });
    // undefined: not looked up yet · null: this stack has no energy counter
    this._energySensorUrl = undefined;
  }

  /** One log line per key and app run, for facts a diagnostic report needs once. */
  _logOnce(key, message) {
    if (this._logged.has(key)) return;
    this._logged.add(key);
    this.ctx.log(message);
  }

  /**
   * A value read from the radiator, shown unless it is the cloud still answering
   * with the state from before a command.
   */
  _show(name, value) {
    if (this._writes.accepts(name, value)) this.ctx.setCapability(name, value);
  }

  async _runModeCommand(mode) {
    const mapping = MODE_TO_ADJUSTABLE_SETPOINT[mode];
    if (!mapping) {
      throw new UnsupportedModeError(`Unsupported heating mode: ${mode}`);
    }
    await this.ctx.executeCommand(mapping.command, [mapping.value]);
    return mapping;
  }

  async setTargetTemperature(value) {
    await this.ctx.executeCommand(EXTRA_COMMANDS.SET_TARGET_TEMPERATURE, [value]);
    this._writes.expect('target_temperature', value);
  }

  async setOnOff(value) {
    await this.setMode(value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const mapping = await this._runModeCommand(mode);
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');

    // Only a mode set through the operating mode comes back as the operating
    // mode; a level (Eco+) never does, so there is nothing to wait for.
    if (mapping.command === EXTRA_COMMANDS.SET_OPERATING_MODE) {
      this._writes.expect('cozytouch_heating_mode', mode);
      this._writes.expect('onoff', mode !== 'off');
    }
  }

  /**
   * Replace the comfort periods of one day, or of a group of days, and leave the
   * rest of the weekly program as the radiator reports it.
   *
   * setTimeProgram is sent the structure core:TimeProgramState was read in; its
   * parameter format is not documented anywhere, so the payload is logged.
   *
   * @param {string} day - a weekday, or weekdays / weekend / all
   * @param {string} periods - "06:30-08:00, 17:00-22:00", empty for eco all day
   */
  async setComfortPeriods(day, periods) {
    const days = resolveDays(day);
    const windows = parsePeriods(periods);

    const supported = this.ctx.store && this.ctx.store.overkizCommands;
    if (pickCommand(supported, [EXTRA_COMMANDS.SET_TIME_PROGRAM]) === null) {
      throw new ScheduleError('this radiator does not accept schedule changes');
    }

    const states = await this.ctx.getDeviceState();
    const program = applyPeriods(
      getStateValue(states, ADJUSTABLE_SETPOINT_STATES.TIME_PROGRAM),
      days,
      windows,
    );

    this.ctx.log(`Sending ${EXTRA_COMMANDS.SET_TIME_PROGRAM}: ${JSON.stringify(program)}`);
    await this.ctx.executeCommand(EXTRA_COMMANDS.SET_TIME_PROGRAM, [program]);
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

  /**
   * The energy counter is an endpoint of its own on the radiator's stack. Looked
   * up by name in the account's device list; a failed lookup is not remembered,
   * so the next poll tries again, while "there is none" is.
   */
  async _findEnergySensorUrl() {
    if (this._energySensorUrl !== undefined) return this._energySensorUrl;

    try {
      const devices = await this.ctx.api.getDevices();
      const sensor = findStackSibling(devices, this.ctx.deviceURL, isElectricEnergySensor);
      this._energySensorUrl = sensor ? sensor.deviceURL : null;
    } catch (err) {
      this.ctx.log(`Energy counter lookup failed: ${err.message}`);
      return null;
    }
    return this._energySensorUrl;
  }

  /** Cumulated consumption in Wh, or null when this radiator has no counter. */
  async _readEnergyWh() {
    const sensorUrl = await this._findEnergySensorUrl();
    if (!sensorUrl) return null;

    try {
      const sensorStates = await this.ctx.api.getDeviceState(sensorUrl);
      return toNumber(getStateValue(sensorStates, STATES.ELECTRIC_ENERGY));
    } catch (err) {
      this.ctx.log(`Energy counter unavailable: ${err.message}`);
      return null;
    }
  }

  /**
   * @param {boolean|null} heatingOff - whether the radiator is switched off; its
   *   working rate is not trusted then (a dump of a radiator in standby still
   *   read 100 %).
   */
  async _updateEnergy(states, heatingOff) {
    const rated = toNumber(getStateValue(states, ADJUSTABLE_SETPOINT_STATES.RATED_POWER));
    const rate = toNumber(getStateValue(states, ADJUSTABLE_SETPOINT_STATES.WORKING_RATE));
    if (rated !== null && rate !== null && await this.ctx.ensureCapability('measure_power')) {
      // The radiator measures no power; this is its rating over its duty cycle,
      // so Homey is told it is an approximation (the flag name is the one in
      // Homey's own measure_power definition).
      this.ctx.setCapabilityOptions('measure_power', { isApproximated: true });
      const share = Math.min(Math.max(rate, 0), 100) / 100;
      this.ctx.setCapability('measure_power', heatingOff ? 0 : Math.round(rated * share));
    }

    const wh = await this._readEnergyWh();
    if (wh !== null && await this.ctx.ensureCapability('meter_power')) {
      this.ctx.setCapability('meter_power', wh / 1000);
    }

    this._logOnce('energy', `Energy readings: rated ${rated}W, working rate ${rate}%, counter ${wh}Wh`);
  }

  async _updateLevel(level) {
    if (level === null) return;
    if (!PASS_COZYTOUCH_LEVELS.includes(level)) {
      this._logOnce(`level:${level}`, `Heating level "${level}" is not one the tile knows; left as it was`);
      return;
    }
    if (await this.ctx.ensureCapability('cozytouch_heating_level')) {
      this.ctx.setCapability('cozytouch_heating_level', level);
    }
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    // null when nothing the radiator reported says whether it is off
    let heatingOff = null;

    // The mode comes from the operating mode alone. The level is what the
    // radiator applies right now, and a programmed radiator is at its eco level
    // for most of the day without having left its program.
    const level = getStateValue(states, STATES.TARGET_HEATING_LEVEL);
    const opMode = getStateValue(states, ADJUSTABLE_SETPOINT_STATES.OPERATING_MODE);
    if (opMode !== null) {
      // Said once per value: "internal" and "external" both read as Program, and
      // which one a radiator reports is what a report about its schedule needs.
      this._logOnce(`mode:${opMode}`, `Operating mode reported by the radiator: "${opMode}"`);
      const modeStr = ADJUSTABLE_SETPOINT_OPERATING_TO_MODE[opMode] || 'manual';
      this._show('cozytouch_heating_mode', modeStr);
      this._show('onoff', modeStr !== 'off');
      heatingOff = modeStr === 'off';
    } else {
      const onOff = getStateValue(states, STATES.ON_OFF);
      if (onOff !== null) {
        const isOn = onOff === 'on';
        this._show('onoff', isOn);
        this._show('cozytouch_heating_mode', isOn ? 'manual' : 'off');
        heatingOff = !isOn;
      }
    }

    await this._updateLevel(level);

    const targetTemp = getStateValue(states, 'core:TargetTemperatureState')
      || getStateValue(states, STATES.HEATING_TARGET_TEMP);
    if (targetTemp !== null) {
      this._show('target_temperature', parseFloat(targetTemp));
    }

    // Room temperature lives on linked sensor #2, not on the main actuator.
    const currentTemp = await this._readLinkedTemperature();
    if (currentTemp !== null && !Number.isNaN(currentTemp)) {
      this.ctx.setCapability('measure_temperature', currentTemp);
    }

    await this._updateEnergy(states, heatingOff);

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

AdjustableSetpointOverkizHandler.UnsupportedModeError = UnsupportedModeError;

module.exports = AdjustableSetpointOverkizHandler;
