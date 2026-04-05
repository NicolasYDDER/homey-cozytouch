'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const TowelRackCozytouchHandler = require('./handlers/cozytouch');
const TowelRackOverkizHandler = require('./handlers/overkiz');
const HeaterOverkizHandler = require('../heater/handlers/overkiz');

class TowelRackDevice extends CozyTouchDevice {

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    if (this._protocol === 'overkiz') {
      // HeatingSystem devices (e.g. Serenis Premium) use heater-style commands,
      // while TowelDryer devices use setTowelDryerOperatingMode.
      if (store.uiClass === 'HeatingSystem') {
        return new HeaterOverkizHandler(ctx);
      }
      return new TowelRackOverkizHandler(ctx);
    }
    return new TowelRackCozytouchHandler(ctx);
  }

  _registerCapabilityListeners() {
    this._registerCapability('target_temperature', (value) =>
      this._handler.setTargetTemperature(value));

    this._registerCapability('onoff', (value) =>
      this._handler.setOnOff(value));

    this._registerCapability('cozytouch_heating_mode', (value) =>
      this._handler.setMode(value));
  }

  async setHeatingMode(mode) {
    await this._handler.setMode(mode);
  }

}

module.exports = TowelRackDevice;
