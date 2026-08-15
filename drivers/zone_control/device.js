'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const ZoneControlOverkizHandler = require('./handlers/overkiz-zone-control');
const ZoneOverkizHandler = require('./handlers/overkiz-zone');

class ZoneControlDevice extends CozyTouchDevice {

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    if (this._protocol !== 'overkiz') {
      throw new Error('Shogun Zone Control only supports Overkiz devices');
    }
    if (store.passApcRole === 'controller') {
      return new ZoneControlOverkizHandler(ctx);
    }
    if (store.passApcRole === 'zone') {
      return new ZoneOverkizHandler(ctx);
    }
    throw new Error(`Unknown Zone Control role: ${store.passApcRole}`);
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

module.exports = ZoneControlDevice;
