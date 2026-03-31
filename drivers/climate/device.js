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
    this.registerCapabilityListener('target_temperature', async (value) => {
      this.log(`Setting target temperature to ${value}`);
      await this._handler.setTargetTemperature(value);
    });

    this.registerCapabilityListener('onoff', async (value) => {
      this.log(`Setting power to ${value ? 'ON' : 'OFF'}`);
      await this._handler.setOnOff(value);
    });

    this.registerCapabilityListener('cozytouch_hvac_mode', async (value) => {
      this.log(`Setting HVAC mode to ${value}`);
      await this._handler.setMode(value);
    });

    if (this.hasCapability('cozytouch_fan_mode')) {
      this.registerCapabilityListener('cozytouch_fan_mode', async (value) => {
        this.log(`Setting fan mode to ${value}`);
        await this._handler.setFanMode(value);
      });
    }

    if (this.hasCapability('cozytouch_swing_mode')) {
      this.registerCapabilityListener('cozytouch_swing_mode', async (value) => {
        this.log(`Setting swing mode to ${value}`);
        await this._handler.setSwingMode(value);
      });
    }
  }

  async setHvacMode(mode) {
    await this._handler.setMode(mode);
  }

}

module.exports = ClimateDevice;
