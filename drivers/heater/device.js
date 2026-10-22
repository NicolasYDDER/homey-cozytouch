'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const HeaterCozytouchHandler = require('./handlers/cozytouch');
const HeaterOverkizHandler = require('./handlers/overkiz');
const AdjustableSetpointOverkizHandler = require('./handlers/overkiz-adjustable-setpoint');
const { isAdjustableSetpointElectricalHeater } = require('../../lib/helpers/overkiz-device');
const { ScheduleError } = require('../../lib/helpers/time-program');

const { UnsupportedModeError } = AdjustableSetpointOverkizHandler;

class HeaterDevice extends CozyTouchDevice {

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    if (this._protocol === 'overkiz') {
      // Ipala / adjustable-setpoint radiators — not the generic heater dialect
      if (isAdjustableSetpointElectricalHeater(store)) {
        return new AdjustableSetpointOverkizHandler(ctx);
      }
      return new HeaterOverkizHandler(ctx);
    }
    return new HeaterCozytouchHandler(ctx);
  }

  _registerCapabilityListeners() {
    if (this.hasCapability('target_temperature')) {
      this._registerCapability('target_temperature', (value) =>
        this._handler.setTargetTemperature(value));
    }

    this._registerCapability('onoff', (value) =>
      this._handler.setOnOff(value));

    this._registerCapability('cozytouch_heating_mode', (value) =>
      this._handler.setMode(value));
  }

  /**
   * Flow action: the shared "Set heating mode" dropdown lists modes across every
   * driver, so a radiator can be asked for one it has no command for. That comes
   * back to the Flow as a readable error instead of the raw handler message.
   */
  async setHeatingMode(mode) {
    try {
      await this._handler.setMode(mode);
    } catch (err) {
      if (err instanceof UnsupportedModeError) {
        throw new Error(`${this.homey.__('errors.mode_not_supported')} (${mode})`);
      }
      throw err;
    }
  }

  /**
   * Flow action: replace the comfort periods of a day (or group of days) on a
   * radiator with a weekly schedule. A request that cannot be applied comes back
   * to the Flow as a readable error, with the reason after the localized prefix.
   */
  async setComfortPeriods(day, periods) {
    if (typeof this._handler.setComfortPeriods !== 'function') {
      throw new Error(this.homey.__('errors.schedule_not_supported'));
    }
    try {
      await this._handler.setComfortPeriods(day, periods);
    } catch (err) {
      if (err instanceof ScheduleError) {
        throw new Error(`${this.homey.__('errors.schedule_failed')} ${err.message}`);
      }
      throw err;
    }
  }

}

module.exports = HeaterDevice;
