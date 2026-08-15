'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const ClimateCozytouchHandler = require('./handlers/cozytouch');
const ClimateOverkizHandler = require('./handlers/overkiz');
const PassAPCZoneControlOverkizHandler = require('./handlers/overkiz-pass-apc-zone-control');
const PassAPCZoneOverkizHandler = require('./handlers/overkiz-pass-apc-zone');

class ClimateDevice extends CozyTouchDevice {

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    if (this._protocol === 'overkiz') {
      if (store.passApcRole === 'controller') {
        return new PassAPCZoneControlOverkizHandler(ctx);
      }
      if (store.passApcRole === 'zone') {
        return new PassAPCZoneOverkizHandler(ctx);
      }
      return new ClimateOverkizHandler(ctx);
    }
    return new ClimateCozytouchHandler(ctx, store.hvacModes, store.deviceType);
  }

  _registerCapabilityListeners() {
    if (this.hasCapability('target_temperature')) {
      this._registerCapability('target_temperature', (value) =>
        this._handler.setTargetTemperature(value));
    }

    if (this.hasCapability('onoff')) {
      this._registerCapability('onoff', (value) =>
        this._handler.setOnOff(value));
    }

    if (this.hasCapability('cozytouch_hvac_mode')) {
      this._registerCapability('cozytouch_hvac_mode', (value) =>
        this._handler.setMode(value));
    }

    if (this.hasCapability('cozytouch_heating_mode')) {
      this._registerCapability('cozytouch_heating_mode', (value) =>
        this._handler.setMode(value));
    }

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
    if (!this.hasCapability('cozytouch_hvac_mode')) {
      throw new Error('This device does not support HVAC mode');
    }
    await this._handler.setMode(mode);
  }

  async setHeatingMode(mode) {
    if (!this.hasCapability('cozytouch_heating_mode')) {
      throw new Error('This device does not support heating mode');
    }
    await this._handler.setMode(mode);
  }

}

module.exports = ClimateDevice;
