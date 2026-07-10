'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const TowelRackCozytouchHandler = require('./handlers/cozytouch');
const TowelRackOverkizHandler = require('./handlers/overkiz');
const HeaterOverkizHandler = require('../heater/handlers/overkiz');
const FilPiloteOverkizHandler = require('../heater/handlers/overkiz-fil-pilote');
const { isFilPiloteElectricalHeater } = require('../../lib/helpers/overkiz-device');

class TowelRackDevice extends CozyTouchDevice {

  async onInit() {
    const store = this.getStore();
    if (this.getStore().protocol === 'overkiz' && isFilPiloteElectricalHeater(store)) {
      const modeValues = [
        { id: 'off', title: { en: 'Off', fr: 'Arrêt' } },
        { id: 'manual', title: { en: 'Comfort', fr: 'Confort' } },
        { id: 'eco_plus', title: { en: 'Eco', fr: 'Éco' } },
      ];
      await this.setCapabilityOptions('cozytouch_heating_mode', { values: modeValues });
    }

    await super.onInit();
  }

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    if (this._protocol === 'overkiz') {
      if (isFilPiloteElectricalHeater(store)) {
        return new FilPiloteOverkizHandler(ctx);
      }
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

module.exports = TowelRackDevice;
