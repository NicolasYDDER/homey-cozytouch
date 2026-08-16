'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const {
  ZONE_CONTROL_HVAC_MODE_VALUES,
  ZONE_CONTROL_ZONE_HEATING_MODE_OPTIONS,
} = require('./constants');
const ZoneControlOverkizHandler = require('./handlers/overkiz-zone-control');
const ZoneOverkizHandler = require('./handlers/overkiz-zone');

class ZoneControlDevice extends CozyTouchDevice {

  async onInit() {
    const store = this.getStore();
    const role = store.zoneControlRole || store.passApcRole;

    if (role === 'controller' && this.hasCapability('cozytouch_hvac_mode')) {
      await this.setCapabilityOptions('cozytouch_hvac_mode', {
        values: ZONE_CONTROL_HVAC_MODE_VALUES,
      });
    }

    if (role === 'zone') {
      if (!this.hasCapability('onoff')) {
        await this.addCapability('onoff');
      }
      // Native Homey thermostat_mode (defaults) for tile heat/cool colors
      if (!this.hasCapability('thermostat_mode')) {
        await this.addCapability('thermostat_mode');
      }
      if (this.hasCapability('cozytouch_heating_mode')) {
        await this.setCapabilityOptions(
          'cozytouch_heating_mode',
          ZONE_CONTROL_ZONE_HEATING_MODE_OPTIONS,
        );
      }
    }

    await super.onInit();
  }

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    if (this._protocol !== 'overkiz') {
      throw new Error('Shogun Zone Control only supports Overkiz devices');
    }
    const role = store.zoneControlRole || store.passApcRole;
    if (role === 'controller') {
      return new ZoneControlOverkizHandler(ctx);
    }
    if (role === 'zone') {
      return new ZoneOverkizHandler(ctx);
    }
    throw new Error(`Unknown Zone Control role: ${role}`);
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

    // thermostat_mode is read-only on zones (tile colors). Homey still shows
    // native Flow ALORS cards — they fail with a clear message on purpose.
    if (this.hasCapability('thermostat_mode')) {
      this._registerCapability('thermostat_mode', async () => {
        throw new Error(this.homey.__('errors.zone_thermostat_mode_readonly'));
      });
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
