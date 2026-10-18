'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const HeaterCozytouchHandler = require('./handlers/cozytouch');
const HeaterOverkizHandler = require('./handlers/overkiz');
const AdjustableSetpointOverkizHandler = require('./handlers/overkiz-adjustable-setpoint');
const { isAdjustableSetpointElectricalHeater } = require('../../lib/helpers/overkiz-device');
const { ScheduleError } = require('../../lib/helpers/time-program');

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

  async setHeatingMode(mode) {
    await this._handler.setMode(mode);
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
