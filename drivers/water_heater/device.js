'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const WaterHeaterCozytouchHandler = require('./handlers/cozytouch');
const WaterHeaterOverkizHandler = require('./handlers/overkiz');

const POST_COMMAND_REFRESH_DELAY_MS = 3000;

class WaterHeaterDevice extends CozyTouchDevice {

  async onInit() {
    // Add capabilities that were added after initial pairing
    if (!this.hasCapability('cozytouch_boost')) {
      await this.addCapability('cozytouch_boost');
    }
    if (this.hasCapability('cozytouch_shower_count')) {
      await this.removeCapability('cozytouch_shower_count');
    }
    // A water heater is always-on by design; the onoff toggle was confusing
    // users into putting it in complete standby. Mode picker is the only control now.
    if (this.hasCapability('onoff')) {
      await this.removeCapability('onoff');
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
    const withRefresh = (fn) => async (value) => {
      await fn(value);
      this._schedulePostCommandRefresh();
    };

    this._registerCapability('target_temperature', withRefresh((value) =>
      this._handler.setTargetTemperature(value)));

    this._registerCapability('cozytouch_heating_mode', withRefresh((value) =>
      this._handler.setMode(value)));

    this._registerCapability('cozytouch_away_mode', withRefresh((value) =>
      this._handler.setAwayMode(value)));

    if (this.hasCapability('cozytouch_boost')) {
      this._registerCapability('cozytouch_boost', withRefresh((value) =>
        this._handler.setBoost(value)));
    }
  }

  // After a user command, the Cozytouch API needs a moment to reflect the new
  // state. Re-poll shortly after so the UI doesn't wait for the next interval tick.
  _schedulePostCommandRefresh() {
    if (this._postCommandTimeout) {
      this.homey.clearTimeout(this._postCommandTimeout);
    }
    this._postCommandTimeout = this.homey.setTimeout(() => {
      this._postCommandTimeout = null;
      this._poll().catch(this.error);
    }, POST_COMMAND_REFRESH_DELAY_MS);
  }

  async onDeleted() {
    if (this._postCommandTimeout) {
      this.homey.clearTimeout(this._postCommandTimeout);
    }
    await super.onDeleted();
  }

  async setHeatingMode(mode) {
    await this._handler.setMode(mode);
    this._schedulePostCommandRefresh();
  }

}

module.exports = WaterHeaterDevice;
