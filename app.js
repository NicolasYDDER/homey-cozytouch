'use strict';

const Homey = require('homey');
const CozyTouchAPI = require('./lib/CozyTouchAPI');
const OverkizAPI = require('./lib/OverkizAPI');

// One app setting: delay between each sync cycle for every device.
// Cycle = Overkiz refreshStates (if any) → poll all devices.
const SYNC_INTERVAL_KEY = 'sync_interval';
const SYNC_INTERVAL_DEFAULT = 60;
const SYNC_INTERVAL_MIN = 30;
const SYNC_INTERVAL_MAX = 300;

class CozyTouchApp extends Homey.App {

  async onInit() {
    this.log('Atlantic Cozytouch is starting...');

    // Store API instances per account (keyed by username + protocol)
    this._cozyInstances = {};
    this._overkizInstances = {};
    this._syncedDevices = new Set();
    this._syncInFlight = false;
    this._syncIntervalHandle = null;

    // Restore saved credentials and pre-authenticate
    await this._restoreCredentials();

    // Register Flow action cards
    this._registerFlowCards();

    // Global sync: Overkiz refresh → poll all devices (Overkiz + Magellan)
    this._startSyncTimer();
    this.homey.setTimeout(() => {
      this._runSyncCycle().catch((err) => this.error('Sync cycle failed:', err.message));
    }, 5000);

    this.log('Atlantic Cozytouch has been initialized');
  }

  // ── Global sync (one interval for every device) ────────────────

  registerSyncedDevice(device) {
    this._syncedDevices.add(device);
  }

  unregisterSyncedDevice(device) {
    this._syncedDevices.delete(device);
  }

  getSyncIntervalSeconds() {
    const raw = this.homey.settings.get(SYNC_INTERVAL_KEY);
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return SYNC_INTERVAL_DEFAULT;
    return Math.min(SYNC_INTERVAL_MAX, Math.max(SYNC_INTERVAL_MIN, n));
  }

  setSyncIntervalSeconds(seconds) {
    const n = parseInt(seconds, 10);
    if (Number.isNaN(n)) {
      throw new Error(`Invalid sync interval: ${seconds}`);
    }
    const clamped = Math.min(SYNC_INTERVAL_MAX, Math.max(SYNC_INTERVAL_MIN, n));
    this.homey.settings.set(SYNC_INTERVAL_KEY, clamped);
    this._startSyncTimer();
    return clamped;
  }

  _startSyncTimer() {
    if (this._syncIntervalHandle) {
      this.homey.clearInterval(this._syncIntervalHandle);
      this._syncIntervalHandle = null;
    }

    const seconds = this.getSyncIntervalSeconds();
    this.log(`Sync interval: ${seconds}s (refresh + poll)`);
    this._syncIntervalHandle = this.homey.setInterval(
      () => this._runSyncCycle().catch((err) => this.error('Sync cycle failed:', err.message)),
      seconds * 1000,
    );
  }

  async _runSyncCycle() {
    if (this._syncInFlight) {
      this.log('Sync skipped (previous cycle still running)');
      return;
    }

    const devices = [...this._syncedDevices];
    if (devices.length === 0) return;

    this._syncInFlight = true;
    try {
      const overkizApis = new Set();
      for (const device of devices) {
        const api = device.getOverkizApi && device.getOverkizApi();
        if (api) overkizApis.add(api);
      }

      for (const api of overkizApis) {
        try {
          if (!api.isAuthenticated()) {
            await api.authenticate();
          }
          await api.refreshStates();
        } catch (err) {
          this.error(`Overkiz refreshStates failed: ${err.message}`);
        }
      }

      for (const device of devices) {
        try {
          await device.pollFromApp();
        } catch (err) {
          this.error(`Poll failed for ${device.getName()}: ${err.message}`);
        }
      }
    } finally {
      this._syncInFlight = false;
    }
  }

  /**
   * Saved Cozytouch account from app settings, or null.
   * @returns {{ username: string, password: string } | null}
   */
  getCredentials() {
    const credentials = this.homey.settings.get('credentials');
    if (!credentials || !credentials.username || !credentials.password) {
      return null;
    }
    return {
      username: credentials.username,
      password: credentials.password,
    };
  }

  /**
   * Persist credentials and reset cached API clients (pairing + settings UI).
   */
  saveCredentials(username, password) {
    if (!username || !password) {
      throw new Error('Username and password are required');
    }
    this.homey.settings.set('credentials', { username, password });
    this._cozyInstances = {};
    this._overkizInstances = {};
  }

  /**
   * Remove saved credentials and reset cached API clients.
   * Paired devices keep working (their own data). Next pairing shows the login form.
   */
  clearCredentials() {
    this.homey.settings.unset('credentials');
    this._cozyInstances = {};
    this._overkizInstances = {};
  }

  /**
   * Restore credentials from settings and attempt to authenticate.
   */
  async _restoreCredentials() {
    const credentials = this.getCredentials();
    if (!credentials) {
      this.log('No saved credentials found');
      return;
    }

    this.log(`Restoring session for ${credentials.username}`);

    try {
      const cozyApi = this.getCozyTouchApi({
        username: credentials.username,
        password: credentials.password,
        deviceId: '',
      });
      await cozyApi.authenticate();
      this.log('CozyTouch session restored');
    } catch (err) {
      this.log(`CozyTouch restore failed: ${err.message}`);
    }

    try {
      const overkizApi = this.getOverkizApi({
        username: credentials.username,
        password: credentials.password,
      });
      await overkizApi.authenticate();
      this.log('Overkiz session restored');
    } catch (err) {
      this.log(`Overkiz restore failed: ${err.message}`);
    }
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

    this.homey.flow.getActionCard('set_zone_control_hvac_mode')
      .registerRunListener(async (args) => {
        await args.device.setHvacMode(args.mode);
      });

    this.homey.flow.getActionCard('set_zone_control_zone_mode')
      .registerRunListener(async (args) => {
        await args.device.setHeatingMode(args.mode);
      });

    this.homey.flow.getActionCard('set_pass_cozytouch_level')
      .registerRunListener(async (args) => {
        await args.device.setPassLevel(args.level);
      });

    this.homey.flow.getConditionCard('is_heating_mode')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('cozytouch_heating_mode') === args.mode;
      });

    this.homey.flow.getConditionCard('is_zone_control_hvac_mode')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('cozytouch_hvac_mode') === args.mode;
      });

    this.homey.flow.getConditionCard('is_zone_control_zone_mode')
      .registerRunListener(async (args) => {
        return args.device.getCapabilityValue('cozytouch_heating_mode') === args.mode;
      });
  }

}

module.exports = CozyTouchApp;
