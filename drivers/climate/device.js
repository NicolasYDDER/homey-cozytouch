'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const ClimateCozytouchHandler = require('./handlers/cozytouch');
const ClimateOverkizHandler = require('./handlers/overkiz');

class ClimateDevice extends CozyTouchDevice {

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    return this._protocol === 'overkiz'
      ? new ClimateOverkizHandler(ctx)
      : new ClimateCozytouchHandler(ctx, store.hvacModes, store.deviceType);
  }

  _registerCapabilityListeners() {
    this._registerCapability('target_temperature', (value) =>
      this._handler.setTargetTemperature(value));

    this._registerCapability('onoff', (value) =>
      this._handler.setOnOff(value));

    this._registerCapability('cozytouch_hvac_mode', (value) =>
      this._handler.setMode(value));

    if (this.hasCapability('cozytouch_fan_mode')) {
      this._registerCapability('cozytouch_fan_mode', (value) =>
        this._handler.setFanMode(value));
    }

    if (this.hasCapability('cozytouch_swing_mode')) {
      this._registerCapability('cozytouch_swing_mode', (value) =>
        this._handler.setSwingMode(value));
    }
  }

  async setHvacMode(mode) {
    await this._handler.setMode(mode);
  }

}

module.exports = ClimateDevice;
