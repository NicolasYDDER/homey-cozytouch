'use strict';

const Homey = require('homey');
const CozyTouchAPI = require('./lib/CozyTouchAPI');

class CozyTouchApp extends Homey.App {

  async onInit() {
    this.log('Atlantic Cozytouch is starting...');

    // Store API instances per account (keyed by username)
    this._apiInstances = {};

    // Register Flow action cards
    this._registerFlowCards();

    this.log('Atlantic Cozytouch has been initialized');
  }

  /**
   * Get or create a CozyTouchAPI instance for the given credentials.
   * Shared across drivers so we don't duplicate connections.
   */
  getApiInstance({ username, password, deviceId }) {
    const key = username;

    if (this._apiInstances[key] && this._apiInstances[key].isAuthenticated()) {
      return this._apiInstances[key];
    }

    const api = new CozyTouchAPI({
      username,
      password,
      deviceId,
      log: this.log.bind(this),
    });

    this._apiInstances[key] = api;
    return api;
  }

  /**
   * Authenticate and discover devices for the given credentials.
   * Used during pairing flow.
   */
  async discoverDevices({ username, password, deviceId }) {
    const api = this.getApiInstance({ username, password, deviceId });

    if (!api.isAuthenticated()) {
      await api.authenticate();
    }

    await api.getSetup();
    return api.getDevices();
  }

  _registerFlowCards() {
    // Action: Set heating mode
    this.homey.flow.getActionCard('set_heating_mode')
      .registerRunListener(async (args) => {
        const { device, mode } = args;
        await device.setHeatingMode(mode);
      });

    // Action: Set HVAC mode
    this.homey.flow.getActionCard('set_hvac_mode')
      .registerRunListener(async (args) => {
        const { device, mode } = args;
        await device.setHvacMode(mode);
      });

    // Condition: Is heating mode
    this.homey.flow.getConditionCard('is_heating_mode')
      .registerRunListener(async (args) => {
        const { device, mode } = args;
        const currentMode = device.getCapabilityValue('cozytouch_heating_mode');
        return currentMode === mode;
      });
  }

}

module.exports = CozyTouchApp;
