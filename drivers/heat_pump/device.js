'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const {
  HEAT_PUMP_ZONE_MODE_VALUES,
  HEAT_PUMP_ZONE_HEATING_MODE_OPTIONS,
  heatPumpHvacModeValues,
} = require('./constants');
const HeatPumpMainOverkizHandler = require('./handlers/overkiz-main');
const HeatPumpZoneOverkizHandler = require('./handlers/overkiz-zone');

const ZONE_MODES = HEAT_PUMP_ZONE_MODE_VALUES.map((value) => value.id);

class HeatPumpDevice extends CozyTouchDevice {

  async onInit() {
    const store = this.getStore();

    if (store.passApcRole === 'main' && this.hasCapability('cozytouch_hvac_mode')) {
      await this.setCapabilityOptions('cozytouch_hvac_mode', {
        values: heatPumpHvacModeValues(store.passApcCooling),
      });
    }

    if (store.passApcRole === 'zone' && this.hasCapability('cozytouch_heating_mode')) {
      await this.setCapabilityOptions(
        'cozytouch_heating_mode',
        HEAT_PUMP_ZONE_HEATING_MODE_OPTIONS,
      );
    }

    await super.onInit();
  }

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    if (this._protocol !== 'overkiz') {
      throw new Error('Pass APC heat pumps are only reachable over Overkiz');
    }
    if (store.passApcRole === 'main') {
      return new HeatPumpMainOverkizHandler(ctx);
    }
    if (store.passApcRole === 'zone') {
      return new HeatPumpZoneOverkizHandler(ctx);
    }
    throw new Error(`Unknown heat pump role: ${store.passApcRole}`);
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

    // thermostat_mode mirrors the main unit so circuit tiles get heat/cool
    // colors. Homey still offers its native Flow cards for it — they fail with a
    // message pointing at the main unit instead of silently doing nothing.
    if (this.hasCapability('thermostat_mode')) {
      this._registerCapability('thermostat_mode', async () => {
        throw new Error(this.homey.__('errors.hvac_mode_on_main_unit'));
      });
    }
  }

  // Called by the shared "Set HVAC mode" Flow card, whose dropdown lists modes a
  // heating-only heat pump has no command for.
  async setHvacMode(mode) {
    if (!this.hasCapability('cozytouch_hvac_mode')) {
      throw new Error(this.homey.__('errors.hvac_mode_on_main_unit'));
    }
    await this._handler.setMode(mode);
  }

  // Called by the shared "Set heating mode" Flow card. A circuit only knows
  // off / manual / prog; Eco+ and Auto exist on other drivers.
  async setHeatingMode(mode) {
    if (!this.hasCapability('cozytouch_heating_mode')) {
      throw new Error(this.homey.__('errors.mode_not_supported'));
    }
    if (!ZONE_MODES.includes(mode)) {
      throw new Error(`${this.homey.__('errors.mode_not_supported')} (${mode})`);
    }
    await this._handler.setMode(mode);
  }

}

module.exports = HeatPumpDevice;
