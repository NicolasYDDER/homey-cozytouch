'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const WaterHeaterCozytouchHandler = require('./handlers/cozytouch');
const WaterHeaterOverkizHandler = require('./handlers/overkiz');

class WaterHeaterDevice extends CozyTouchDevice {

  async onInit() {
    // Add capabilities that were added after initial pairing
    if (!this.hasCapability('cozytouch_boost')) {
      await this.addCapability('cozytouch_boost');
    }
    if (!this.hasCapability('cozytouch_shower_count')) {
      await this.addCapability('cozytouch_shower_count');
    }

    // Water heater only uses off/manual/eco_plus/auto (no prog)
    await this.setCapabilityOptions('cozytouch_heating_mode', {
      values: [
        { id: 'off', title: { en: 'Off', fr: 'Arrêt' } },
        { id: 'manual', title: { en: 'Manual', fr: 'Manuel' } },
        { id: 'eco_plus', title: { en: 'Eco', fr: 'Éco' } },
        { id: 'auto', title: { en: 'Auto', fr: 'Auto' } },
      ],
    });

    await super.onInit();
  }

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    return this._protocol === 'overkiz'
      ? new WaterHeaterOverkizHandler(ctx)
      : new WaterHeaterCozytouchHandler(ctx);
  }

  _registerCapabilityListeners() {
    this._registerCapability('target_temperature', (value) =>
      this._handler.setTargetTemperature(value));

    this._registerCapability('onoff', (value) =>
      this._handler.setOnOff(value));

    this._registerCapability('cozytouch_heating_mode', (value) =>
      this._handler.setMode(value));

    this._registerCapability('cozytouch_away_mode', (value) =>
      this._handler.setAwayMode(value));

    if (this.hasCapability('cozytouch_boost')) {
      this._registerCapability('cozytouch_boost', (value) =>
        this._handler.setBoost(value));
    }

    if (this.hasCapability('cozytouch_shower_count')) {
      this._registerCapability('cozytouch_shower_count', (value) =>
        this._handler.setShowerCount(value));
    }
  }

  async setHeatingMode(mode) {
    await this._handler.setMode(mode);
  }

}

module.exports = WaterHeaterDevice;
