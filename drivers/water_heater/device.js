'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const WaterHeaterCozytouchHandler = require('./handlers/cozytouch');
const WaterHeaterOverkizHandler = require('./handlers/overkiz');
const WaterHeaterOverkizMblHandler = require('./handlers/overkiz-mbl');
const {
  supportedWaterHeaterModes,
  resolveWaterHeaterMode,
} = require('../../lib/helpers/water-heater-modes');
const { waterHeaterCapIds } = require('../../lib/constants/cozytouch-mappings');

const POST_COMMAND_REFRESH_DELAY_MS = 3000;

const MODE_TITLES = {
  off: { en: 'Off', fr: 'Arrêt' },
  manual: { en: 'Manual', fr: 'Manuel' },
  eco_plus: { en: 'Eco', fr: 'Éco' },
  prog: { en: 'Program', fr: 'Programme' },
  auto: { en: 'Auto', fr: 'Auto' },
};

function isMblWidget(store) {
  const url = store.deviceURL || '';
  const widget = store.widget || '';
  const controllable = store.controllableName || '';
  return url.startsWith('modbuslink://')
    || widget === 'AtlanticDomesticHotWaterProductionMBLComponent'
    || controllable.includes('AtlanticDomesticHotWaterProductionMBLComponent');
}

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

    // Water heater mode picker, which differs per protocol: Magellan tanks
    // (Calypso connecté) do prog but not auto, MBL devices (Atlantic Égéo) have
    // no auto mode on the device side — autoMode is how their "eco" is
    // represented. Read from the store: this runs before super.onInit().
    const modeValues = this._supportedModes().map((id) => ({ id, title: MODE_TITLES[id] }));
    await this.setCapabilityOptions('cozytouch_heating_mode', { values: modeValues });

    await super.onInit();
  }

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    if (this._protocol !== 'overkiz') {
      return new WaterHeaterCozytouchHandler(ctx);
    }
    return isMblWidget(store)
      ? new WaterHeaterOverkizMblHandler(ctx)
      : new WaterHeaterOverkizHandler(ctx);
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

  // Protocol comes from the store, not this._protocol: the mode picker is built
  // before super.onInit() has resolved it.
  _modeContext() {
    const store = this.getStore();
    const protocol = store.protocol || 'cozytouch';
    return {
      protocol,
      isMbl: isMblWidget(store),
      // Magellan products without an on/off capability (AQUEO ACI HYB) cannot
      // be switched off at all: leave Off out of the picker instead of offering
      // a command the API refuses.
      hasOnOff: protocol !== 'cozytouch'
        || Boolean(waterHeaterCapIds(store.productId).ON_OFF),
    };
  }

  _supportedModes() {
    return supportedWaterHeaterModes(this._modeContext());
  }

  // Called by the shared "Set heating mode" Flow card, whose dropdown lists
  // every mode across the heating drivers — including modes a tank has no
  // command for. Modes the tank cannot do are rejected with a readable error
  // instead of silently doing nothing (Program on Overkiz tanks, Auto on
  // Magellan ones), and Auto on MBL falls back to Eco (the same autoMode).
  async setHeatingMode(mode) {
    const { isMbl } = this._modeContext();
    const target = resolveWaterHeaterMode(mode, this._supportedModes(), isMbl);
    if (target === null) {
      throw new Error(`${this.homey.__('errors.mode_not_supported')} (${mode})`);
    }
    await this._handler.setMode(target);
    this._schedulePostCommandRefresh();
  }

  // Called by the "Turn boost on or off" Flow card. Handlers only send the
  // command, so reflect the new value on the tile right away — the follow-up
  // poll confirms it.
  async setBoostMode(value) {
    if (!this.hasCapability('cozytouch_boost')) {
      throw new Error(this.homey.__('errors.boost_not_supported'));
    }
    await this._handler.setBoost(value);
    this._safeSetCapability('cozytouch_boost', value);
    this._schedulePostCommandRefresh();
  }

  // Called by the "Turn away mode on or off" Flow card.
  async setAwayMode(value) {
    await this._handler.setAwayMode(value);
    this._safeSetCapability('cozytouch_away_mode', value);
    this._schedulePostCommandRefresh();
  }

}

module.exports = WaterHeaterDevice;
