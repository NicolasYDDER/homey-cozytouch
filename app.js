'use strict';

const Homey = require('homey');
const CozyTouchAPI = require('./lib/CozyTouchAPI');
const OverkizAPI = require('./lib/OverkizAPI');

class CozyTouchApp extends Homey.App {

  async onInit() {
    this.log('Atlantic Cozytouch is starting...');

    // Store API instances per account (keyed by username + protocol)
    this._cozyInstances = {};
    this._overkizInstances = {};

    // Register Flow action cards
    this._registerFlowCards();

    this.log('Atlantic Cozytouch has been initialized');
  }

  /**
   * Get or create a CozyTouchAPI (Magellan) instance.
   */
  getCozyTouchApi({ username, password, deviceId }) {
    const key = username;
    if (this._cozyInstances[key] && this._cozyInstances[key].isAuthenticated()) {
      return this._cozyInstances[key];
    }
    const api = new CozyTouchAPI({ username, password, deviceId, log: this.log.bind(this) });
    this._cozyInstances[key] = api;
    return api;
  }

  /**
   * Get or create an OverkizAPI instance.
   */
  getOverkizApi({ username, password }) {
    const key = username;
    if (this._overkizInstances[key] && this._overkizInstances[key].isAuthenticated()) {
      return this._overkizInstances[key];
    }
    const api = new OverkizAPI({ username, password, log: this.log.bind(this) });
    this._overkizInstances[key] = api;
    return api;
  }

  /**
   * Discover devices from BOTH protocols (Cozytouch Magellan + Overkiz).
   * Returns a unified list with a `_protocol` tag on each device.
   */
  async discoverDevices({ username, password }) {
    const allDevices = [];

    // ── Protocol 1: Cozytouch / Magellan ────────────────────────
    try {
      const cozyApi = this.getCozyTouchApi({ username, password, deviceId: '' });
      if (!cozyApi.isAuthenticated()) {
        await cozyApi.authenticate();
      }
      await cozyApi.getSetup();
      const cozyDevices = cozyApi.getDevices();

      this.log(`[Cozytouch] Found ${cozyDevices.length} device(s):`);
      cozyDevices.forEach((dev) => {
        dev._protocol = 'cozytouch';
        this.log(`  - "${dev.name}" | deviceId=${dev.deviceId} | modelId=${dev.modelId} | type=${cozyApi.getDeviceType(dev.modelId)}`);
        allDevices.push(dev);
      });
    } catch (err) {
      this.log(`[Cozytouch] Discovery failed: ${err.message}`);
    }

    // ── Protocol 2: Overkiz ─────────────────────────────────────
    try {
      const overkizApi = this.getOverkizApi({ username, password });
      if (!overkizApi.isAuthenticated()) {
        await overkizApi.authenticate();
      }
      await overkizApi.getSetup();
      const overkizDevices = await overkizApi.getDevices();

      this.log(`[Overkiz] Found ${overkizDevices.length} device(s):`);
      overkizDevices.forEach((dev) => {
        dev._protocol = 'overkiz';
        const type = overkizApi.getDeviceType(dev);
        this.log(`  - "${dev.label}" | deviceURL=${dev.deviceURL} | uiClass=${dev.uiClass} | type=${type}`);
        allDevices.push(dev);
      });
    } catch (err) {
      this.log(`[Overkiz] Discovery failed: ${err.message}`);
    }

    if (allDevices.length === 0) {
      throw new Error('No devices found on either Cozytouch or Overkiz protocols');
    }

    this.log(`Total: ${allDevices.length} device(s) across both protocols`);
    return allDevices;
  }

  _registerFlowCards() {
    this.homey.flow.getActionCard('set_heating_mode')
      .registerRunListener(async (args) => {
        await args.device.setHeatingMode(args.mode);
      });

    this.homey.flow.getActionCard('set_hvac_mode')
      .registerRunListener(async (args) => {
        await args.device.setHvacMode(args.mode);
      });

    this.homey.flow.getConditionCard('is_heating_mode')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('cozytouch_heating_mode') === args.mode;
      });
  }

}

module.exports = CozyTouchApp;
