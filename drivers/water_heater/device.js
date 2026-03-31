'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const WaterHeaterCozytouchHandler = require('./handlers/cozytouch');
const WaterHeaterOverkizHandler = require('./handlers/overkiz');

class WaterHeaterDevice extends CozyTouchDevice {

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    return this._protocol === 'overkiz'
      ? new WaterHeaterOverkizHandler(ctx)
      : new WaterHeaterCozytouchHandler(ctx);
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

    this.registerCapabilityListener('cozytouch_away_mode', async (value) => {
      this.log(`Setting away mode to ${value ? 'ON' : 'OFF'}`);
      await this._handler.setAwayMode(value);
    });
  }

  async setHeatingMode(mode) {
    await this._handler.setMode(mode);
  }

}

module.exports = WaterHeaterDevice;
