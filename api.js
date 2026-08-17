'use strict';

const CozyTouchAPI = require('./lib/CozyTouchAPI');
const OverkizAPI = require('./lib/OverkizAPI');

module.exports = {

  /**
   * GET /api/status
   * Returns current connection status for both protocols.
   */
  async getStatus({ homey }) {
    const settings = homey.app.getCredentials() || {};

    const cozyInstance = settings.username
      ? homey.app._cozyInstances[settings.username]
      : null;
    const overkizInstance = settings.username
      ? homey.app._overkizInstances[settings.username]
      : null;

    return {
      hasCredentials: !!settings.username,
      username: settings.username || null,
      syncInterval: homey.app.getSyncIntervalSeconds(),
      syncIntervalMin: 30,
      syncIntervalMax: 300,
      cozytouch: {
        authenticated: cozyInstance ? cozyInstance.isAuthenticated() : false,
        baseUrl: CozyTouchAPI.BASE_URL,
      },
      overkiz: {
        authenticated: overkizInstance ? overkizInstance.isAuthenticated() : false,
        baseUrl: OverkizAPI.OVERKIZ_API,
      },
    };
  },

  /**
   * POST /api/save-sync-interval
   * Saves the global sync interval (seconds) and restarts the timer.
   * One interval for the full cycle: Overkiz refresh + poll of all devices.
   */
  async saveSyncInterval({ homey, body }) {
    const seconds = body && body.seconds;
    const clamped = homey.app.setSyncIntervalSeconds(seconds);
    return { success: true, syncInterval: clamped };
  },

  /**
   * POST /api/test-connection
   * Tests connection to both protocols with provided or saved credentials.
   */
  async testConnection({ homey, body }) {
    const saved = homey.app.getCredentials() || {};
    const username = body.username || saved.username;
    const password = body.password || saved.password;

    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    const results = {
      username,
      cozytouch: { success: false, devices: 0, error: null },
      overkiz: { success: false, devices: 0, error: null },
    };

    // Test CozyTouch / Magellan
    try {
      const cozyApi = new CozyTouchAPI({
        username, password, deviceId: '', log: homey.app.log.bind(homey.app),
      });
      await cozyApi.authenticate();
      await cozyApi.getSetup();
      const devices = cozyApi.getDevices();
      results.cozytouch.success = true;
      results.cozytouch.devices = devices.length;
      results.cozytouch.deviceList = devices.map((d) => ({
        name: d.name,
        modelId: d.modelId,
        type: cozyApi.getDeviceType(d.modelId),
      }));
    } catch (err) {
      results.cozytouch.error = err.message;
    }

    // Test Overkiz
    try {
      const overkizApi = new OverkizAPI({
        username, password, log: homey.app.log.bind(homey.app),
      });
      await overkizApi.authenticate();
      await overkizApi.getSetup();
      const devices = await overkizApi.getDevices();
      results.overkiz.success = true;
      results.overkiz.devices = devices.length;
      results.overkiz.deviceList = devices.map((d) => ({
        name: d.label,
        uiClass: d.uiClass,
        type: overkizApi.getDeviceType(d),
      }));
    } catch (err) {
      results.overkiz.error = err.message;
    }

    return results;
  },

  /**
   * POST /api/save-credentials
   * Saves credentials to app settings.
   */
  async saveCredentials({ homey, body }) {
    const { username, password } = body;
    homey.app.saveCredentials(username, password);
    return { success: true };
  },

  /**
   * POST /api/clear-credentials
   * Removes saved credentials.
   */
  async clearCredentials({ homey }) {
    homey.app.clearCredentials();
    return { success: true };
  },

};
