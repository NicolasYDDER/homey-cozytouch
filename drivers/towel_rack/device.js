'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const TowelRackCozytouchHandler = require('./handlers/cozytouch');
const TowelRackOverkizHandler = require('./handlers/overkiz');

class TowelRackDevice extends CozyTouchDevice {

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    return this._protocol === 'overkiz'
      ? new TowelRackOverkizHandler(ctx)
      : new TowelRackCozytouchHandler(ctx);
  }

  _registerCapabilityListeners() {
    this.registerCapabilityListener('target_temperature', async (value) => {
      this.log(`Setting target temperature to ${value}`);
      await this._handler.setTargetTemperature(value);
    });

    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`Setting power to ${value ? 'ON' : 'OFF'}`);
      await this._handler.setOnOff(value);
    });

    this.registerCapabilityListener('cozytouch_heating_mode', async (value) => {
      this.log(`Setting heating mode to ${value}`);
      await this._handler.setMode(value);
    });
  }

  async setHeatingMode(mode) {
    await this._handler.setMode(mode);
  }

}

module.exports = TowelRackDevice;
