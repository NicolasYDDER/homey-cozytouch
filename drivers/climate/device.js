'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const ClimateCozytouchHandler = require('./handlers/cozytouch');
const ClimateOverkizHandler = require('./handlers/overkiz');
const { climateCapIds } = require('../../lib/constants/cozytouch-mappings');

// A tile the product has no capability for, on a device paired before its block
// said so. Both are AC-only controls, and the heating zones of an Alféa heat
// pump land on this driver through the AC range: a zone paired by 1.4.10 or
// earlier carries a fan-speed and a swing picker that answer «There is no
// implementation for capability Id 9 on product Id 27» when touched.
const PRODUCT_ONLY_CAPABILITIES = [
  ['cozytouch_fan_mode', 'FAN_MODE'],
  ['cozytouch_swing_mode', 'SWING_MODE'],
];

class ClimateDevice extends CozyTouchDevice {

  async onInit() {
    if (this._protocolOf() !== 'overkiz') {
      const caps = climateCapIds(this.getStore().productId);
      for (const [name, capId] of PRODUCT_ONLY_CAPABILITIES) {
        if (!caps[capId] && this.hasCapability(name)) {
          this.log(`Removing ${name}: this product has no such capability`);
          await this.removeCapability(name);
        }
      }
    }
    await super.onInit();
  }

  // The store is readable before super.onInit() runs, which is where
  // `this._protocol` is normally resolved — same default as there.
  _protocolOf() {
    return (this.getStore() || {}).protocol || 'cozytouch';
  }

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    return this._protocol === 'overkiz'
      ? new ClimateOverkizHandler(ctx)
      : new ClimateCozytouchHandler(ctx, store.hvacModes, store.deviceType);
  }

  _registerCapabilityListeners() {
    this._registerCapability('target_temperature', (value) =>
      this._handler.setTargetTemperature(value));

    this._registerCapability('onoff', (value) =>
      this._handler.setOnOff(value));

    this._registerCapability('cozytouch_hvac_mode', (value) =>
      this._handler.setMode(value));

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
    await this._handler.setMode(mode);
  }

}

module.exports = ClimateDevice;
