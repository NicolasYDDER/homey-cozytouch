'use strict';

const https = require('https');
const { URLSearchParams } = require('url');

const BASE_URL = 'https://apis.groupe-atlantic.com';
const CLIENT_ID = 'Q3RfMUpWeVRtSUxYOEllZkE3YVVOQmpGblpVYToyRWNORHpfZHkzNDJVSnFvMlo3cFNKTnZVdjBh';

// Device type classification by modelId
const MODEL_TYPES = {
  GAZ_BOILER: [56, 61, 65, 1444],
  HEAT_PUMP: [76, 211],
  THERMOSTAT: [235, 418],
  WATER_HEATER: [236, 389, 390, 1369, 1376, 1371, 1372, 1642, 1644, 1645, 1656, 1657, 1966],
  TOWEL_RACK: [1381, 1382, 1386, 1388, 1543, 1546, 1547, 1551, 1622],
  AC: [557, 558, 559, 560, 561],
  AC_CONTROLLER: [562, 563, 564, 565, 566, 567, 568, 569, 570],
  HUB: [556, 1353],
};

// HVAC mode mappings per modelId
const HVAC_MODES = {
  // Default: OFF=0, HEAT=4
  default: { 0: 'off', 4: 'heat' },
  // Model 211 (heat pump): OFF=0, HEAT=1, AUTO=2
  211: { 0: 'off', 1: 'heat', 2: 'auto' },
  // AC models 557-561: OFF=0, AUTO=1, COOL=3, HEAT=4, FAN_ONLY=7, DRY=8
  557: { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat', 7: 'fan_only', 8: 'dry' },
  558: { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat', 7: 'fan_only', 8: 'dry' },
  559: { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat', 7: 'fan_only', 8: 'dry' },
  560: { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat', 7: 'fan_only', 8: 'dry' },
  561: { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat', 7: 'fan_only', 8: 'dry' },
};

// Heating modes for water heaters and boilers
const HEATING_MODES = {
  0: 'manual',
  3: 'eco_plus',
  4: 'prog',
};

class CozyTouchAPI {

  constructor({ username, password, deviceId, log }) {
    this._username = username;
    this._password = password;
    this._deviceId = deviceId;
    this._log = log || console.log;
    this._accessToken = null;
    this._tokenType = null;
    this._devices = [];
    this._setup = null;
  }

  // ── Authentication ──────────────────────────────────────────────

  async authenticate() {
    const body = new URLSearchParams({
      grant_type: 'password',
      scope: 'openid',
      username: `GA-PRIVATEPERSON/${this._username}`,
      password: this._password,
    });

    const response = await this._request('POST', '/users/token', body.toString(), {
      Authorization: `Basic ${CLIENT_ID}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    if (!response.access_token || !response.token_type) {
      throw new Error('Authentication failed: invalid response from Cozytouch API');
    }

    this._accessToken = response.access_token;
    this._tokenType = response.token_type;
    this._log('Cozytouch authentication successful');
    return true;
  }

  isAuthenticated() {
    return this._accessToken !== null;
  }

  // ── Device Discovery ────────────────────────────────────────────

  async getSetup() {
    this._ensureAuth();
    const data = await this._authedGet('/magellan/cozytouch/setupviewv2');

    // Debug: log the raw top-level structure
    this._log(`Setup API response type: ${typeof data}, isArray: ${Array.isArray(data)}`);
    if (data) {
      this._log(`Setup API response keys: ${JSON.stringify(Array.isArray(data) ? `array[${data.length}]` : Object.keys(data))}`);
    }

    // Handle both array and object responses
    if (Array.isArray(data) && data.length > 0) {
      this._setup = data[0];
    } else if (data && typeof data === 'object') {
      this._setup = data;
    } else {
      throw new Error('No setup data returned from Cozytouch API');
    }

    this._devices = this._setup.devices || [];
    this._log(`Setup contains ${this._devices.length} device(s). Top-level keys: ${JSON.stringify(Object.keys(this._setup))}`);

    // Debug: dump first device structure if any
    if (this._devices.length > 0) {
      this._log(`First device keys: ${JSON.stringify(Object.keys(this._devices[0]))}`);
    }

    return this._setup;
  }

  getDevices() {
    return this._devices;
  }

  getDevicesByType(type) {
    const modelIds = MODEL_TYPES[type] || [];
    return this._devices.filter((d) => modelIds.includes(d.modelId));
  }

  getDeviceType(modelId) {
    for (const [type, ids] of Object.entries(MODEL_TYPES)) {
      if (ids.includes(modelId)) return type;
    }
    return 'UNKNOWN';
  }

  getHvacModes(modelId) {
    return HVAC_MODES[modelId] || HVAC_MODES.default;
  }

  // ── Capabilities ────────────────────────────────────────────────

  async getCapabilities(deviceId) {
    this._ensureAuth();
    const id = deviceId || this._deviceId;
    return this._authedGet(`/magellan/capabilities/?deviceId=${id}`);
  }

  getCapabilityValue(capabilities, capabilityId) {
    const cap = capabilities.find((c) => c.capabilityId === capabilityId);
    return cap ? cap.value : null;
  }

  // ── Commands ────────────────────────────────────────────────────

  async setCapabilityValue(deviceId, capabilityId, value) {
    this._ensureAuth();

    const payload = {
      capabilityId,
      deviceId,
      value: String(value),
    };

    const response = await this._authedPost('/magellan/executions/writecapability', payload);

    // If we got an executionId, poll for completion
    if (response && response.executionId) {
      return this._waitForExecution(response.executionId);
    }

    return response;
  }

  async _waitForExecution(executionId, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
      await this._sleep(1000);
      const status = await this._authedGet(`/magellan/executions/${executionId}`);
      if (status && status.state === 3) {
        return status; // Completed
      }
    }
    throw new Error(`Execution ${executionId} did not complete within timeout`);
  }

  // ── Away Mode ───────────────────────────────────────────────────

  async setAwayMode(setupId, awayData) {
    this._ensureAuth();
    return this._authedPut(`/magellan/v2/setups/${setupId}`, awayData);
  }

  // ── HTTP Layer ──────────────────────────────────────────────────

  _ensureAuth() {
    if (!this._accessToken) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
  }

  _getAuthHeaders() {
    return {
      Authorization: `Bearer ${this._accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async _authedGet(path) {
    return this._request('GET', path, null, this._getAuthHeaders());
  }

  async _authedPost(path, data) {
    return this._request('POST', path, JSON.stringify(data), this._getAuthHeaders());
  }

  async _authedPut(path, data) {
    return this._request('PUT', path, JSON.stringify(data), this._getAuthHeaders());
  }

  _request(method, path, body, headers) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, BASE_URL);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers: headers || {},
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            const error = new Error(`API request failed: ${res.statusCode} ${data}`);
            error.statusCode = res.statusCode;
            error.body = data;
            return reject(error);
          }

          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });

      if (body) req.write(body);
      req.end();
    });
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

}

// Export constants for drivers
CozyTouchAPI.MODEL_TYPES = MODEL_TYPES;
CozyTouchAPI.HVAC_MODES = HVAC_MODES;
CozyTouchAPI.HEATING_MODES = HEATING_MODES;
CozyTouchAPI.BASE_URL = BASE_URL;

module.exports = CozyTouchAPI;
