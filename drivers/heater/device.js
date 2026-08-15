'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const HeaterCozytouchHandler = require('./handlers/cozytouch');
const HeaterOverkizHandler = require('./handlers/overkiz');
const AdjustableSetpointOverkizHandler = require('./handlers/overkiz-adjustable-setpoint');
const { isAdjustableSetpointElectricalHeater } = require('../../lib/helpers/overkiz-device');

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

}

module.exports = HeaterDevice;
