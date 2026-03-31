'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const HeaterCozytouchHandler = require('./handlers/cozytouch');
const HeaterOverkizHandler = require('./handlers/overkiz');

class HeaterDevice extends CozyTouchDevice {

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    return this._protocol === 'overkiz'
      ? new HeaterOverkizHandler(ctx)
      : new HeaterCozytouchHandler(ctx);
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

module.exports = HeaterDevice;
