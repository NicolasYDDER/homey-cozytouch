'use strict';

const https = require('https');
const { URLSearchParams } = require('url');

const ATLANTIC_API = 'https://apis.groupe-atlantic.com';
const OVERKIZ_API = 'https://ha110-1.overkiz.com/enduser-mobile-web/enduserAPI';
const CLIENT_ID = 'Q3RfMUpWeVRtSUxYOEllZkE3YVVOQmpGblpVYToyRWNORHpfZHkzNDJVSnFvMlo3cFNKTnZVdjBh';

// Overkiz state names for water heaters
const STATES = {
  // DHW (Domestic Hot Water)
  TARGET_DHW_TEMP: 'core:TargetDHWTemperatureState',
  COMFORT_DHW_TEMP: 'core:ComfortTargetDHWTemperatureState',
  ECO_DHW_TEMP: 'core:EcoTargetDHWTemperatureState',
  DHW_TEMP: 'core:DHWTemperatureState',
  DHW_ON_OFF: 'core:DHWOnOffState',
  DHW_MODE: 'io:DHWModeState',
  DHW_BOOST: 'io:DHWBoostModeState',
  DHW_ABSENCE: 'io:DHWAbsenceModeState',
  MIDDLE_WATER_TEMP: 'io:MiddleWaterTemperatureState',
  BOTTOM_WATER_TEMP: 'core:BottomTankWaterTemperatureState',
  WATER_TARGET_TEMP: 'core:WaterTargetTemperatureState',

  // Heating
  HEATING_TARGET_TEMP: 'core:HeatingTargetTemperatureState',
  COMFORT_HEATING_TEMP: 'core:ComfortHeatingTargetTemperatureState',
  ECO_HEATING_TEMP: 'core:EcoHeatingTargetTemperatureState',
  HEATING_ON_OFF: 'core:HeatingOnOffState',
  HEATING_STATUS: 'core:HeatingStatusState',
  TARGET_HEATING_LEVEL: 'io:TargetHeatingLevelState',
  MIN_HEATING_TEMP: 'core:MinimumHeatingTargetTemperatureState',
  MAX_HEATING_TEMP: 'core:MaximumHeatingTargetTemperatureState',

  // General
  TEMPERATURE: 'core:TemperatureState',
  ON_OFF: 'core:OnOffState',
  BOOST_ON_OFF: 'core:BoostOnOffState',

  // Energy
  ELECTRIC_ENERGY: 'core:ElectricEnergyConsumptionState',
  ELECTRIC_POWER: 'core:ElectricPowerConsumptionState',
};

// Overkiz command names
const COMMANDS = {
  // DHW
  SET_DHW_TEMP: 'setTargetDHWTemperature',
  SET_COMFORT_DHW_TEMP: 'setComfortTargetDHWTemperature',
  SET_ECO_DHW_TEMP: 'setEcoTargetDHWTemperature',
  SET_DHW_MODE: 'setDHWMode',
  SET_DHW_ON_OFF: 'setDHWOnOffState',
  SET_WATER_TARGET_TEMP: 'setWaterTargetTemperature',

  // Heating
  SET_HEATING_TARGET_TEMP: 'setHeatingTargetTemperature',
  SET_COMFORT_HEATING_TEMP: 'setComfortHeatingTargetTemperature',
  SET_ECO_HEATING_TEMP: 'setEcoHeatingTargetTemperature',
  SET_HEATING_ON_OFF: 'setHeatingOnOffState',
  SET_HEATING_LEVEL: 'setHeatingLevel',

  // Modes
  SET_BOOST_MODE: 'setBoostMode',
  SET_ABSENCE_MODE: 'setAbsenceMode',
  CANCEL_ABSENCE: 'cancelAbsence',
  SET_BOOST_ON_OFF: 'setBoostOnOffState',

  // General
  ON: 'on',
  OFF: 'off',
  SET_ON_OFF: 'setOnOff',
};

// Device classification by Overkiz ui_class
const OVERKIZ_DEVICE_TYPES = {
  WATER_HEATER: ['WaterHeatingSystem', 'DomesticHotWaterProduction', 'DomesticHotWaterTank'],
  HEATER: ['HeatingSystem', 'ExteriorHeatingSystem', 'Heater'],
  CLIMATE: ['HitachiAirToWaterHeatingZone', 'HitachiAirToAirHeatPump', 'AirConditioningSystem'],
  THERMOSTAT: ['HeatingSetPoint', 'Thermostat'],
  TOWEL_RACK: ['TowelDryer'],
};

class OverkizAPI {

  constructor({ username, password, log }) {
    this._username = username;
    this._password = password;
    this._log = log || console.log;
    this._accessToken = null;
    this._jwt = null;
    this._cookies = '';  // Session cookies from Overkiz login
    this._devices = [];
    this._setup = null;
    this._listenerId = null;
  }

  // ── Authentication (two-step: Atlantic token → JWT → Overkiz login) ──

  async authenticate() {
    // Step 1: Get Atlantic access token (same endpoint as CozyTouch API)
    const body = new URLSearchParams({
      grant_type: 'password',
      scope: 'openid',
      username: `GA-PRIVATEPERSON/${this._username}`,
      password: this._password,
    });

    const tokenResponse = await this._request('POST', ATLANTIC_API, '/users/token', body.toString(), {
      Authorization: `Basic ${CLIENT_ID}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    if (!tokenResponse.access_token) {
      throw new Error('Overkiz auth step 1 failed: no access_token');
    }

    this._accessToken = tokenResponse.access_token;
    this._log('Overkiz auth step 1: Atlantic token acquired');

    // Step 2: Exchange for JWT
    const jwtResponse = await this._request('GET', ATLANTIC_API, '/magellan/accounts/jwt', null, {
      Authorization: `Bearer ${this._accessToken}`,
    });

    if (!jwtResponse || (!jwtResponse.jwt && typeof jwtResponse !== 'string')) {
      throw new Error('Overkiz auth step 2 failed: no JWT returned');
    }

    this._jwt = jwtResponse.jwt || jwtResponse;
    this._log('Overkiz auth step 2: JWT acquired');

    // Step 3: Login to Overkiz with JWT (captures session cookies)
    const loginResponse = await this._requestWithCookies('POST', OVERKIZ_API, '/login', JSON.stringify({ jwt: this._jwt }), {
      'Content-Type': 'application/json',
    });

    if (loginResponse.body && loginResponse.body.success === false) {
      throw new Error(`Overkiz auth step 3 failed: ${loginResponse.body.error || 'login rejected'}`);
    }

    // Store session cookies (JSESSIONID) for subsequent requests
    this._cookies = (loginResponse.cookies || [])
      .map((c) => c.split(';')[0])
      .join('; ');

    if (!this._cookies) {
      this._log('Warning: No session cookies received from Overkiz login');
    } else {
      this._log(`Overkiz auth step 3: session established (${this._cookies.substring(0, 40)}...)`);
    }

    this._log('Overkiz authentication successful');
    return true;
  }

  isAuthenticated() {
    return this._jwt !== null;
  }

  // ── Device Discovery ──────────────────────────────────────────────

  async getSetup() {
    const data = await this._overkizGet('/setup');
    this._setup = data;
    this._devices = data.devices || [];
    this._log(`Overkiz setup: ${this._devices.length} device(s) found`);
    return this._setup;
  }

  async getDevices() {
    if (this._devices.length === 0) {
      const data = await this._overkizGet('/setup/devices');
      this._devices = data || [];
    }
    return this._devices;
  }

  getDeviceType(device) {
    const uiClass = device.uiClass || device.ui_class || '';
    for (const [type, classes] of Object.entries(OVERKIZ_DEVICE_TYPES)) {
      if (classes.includes(uiClass)) return type;
    }
    return 'UNKNOWN';
  }

  // ── State Reading ─────────────────────────────────────────────────

  getStateValue(device, stateName) {
    const states = device.states || [];
    const state = states.find((s) => s.name === stateName);
    return state ? state.value : null;
  }

  async refreshStates() {
    await this._overkizPost('/setup/devices/states/refresh', null);
  }

  async getDeviceState(deviceUrl) {
    return this._overkizGet(`/setup/devices/${encodeURIComponent(deviceUrl)}/states`);
  }

  // ── Event Polling ─────────────────────────────────────────────────

  async registerEventListener() {
    const response = await this._overkizPost('/events/register', null);
    this._listenerId = response.id;
    this._log(`Overkiz event listener registered: ${this._listenerId}`);
    return this._listenerId;
  }

  async fetchEvents() {
    if (!this._listenerId) {
      await this.registerEventListener();
    }
    return this._overkizPost(`/events/${this._listenerId}/fetch`, null);
  }

  // ── Commands ──────────────────────────────────────────────────────

  async executeCommand(deviceUrl, commandName, parameters) {
    const payload = {
      label: 'homey-cozytouch',
      actions: [
        {
          deviceURL: deviceUrl,
          commands: [
            {
              name: commandName,
              parameters: parameters || [],
            },
          ],
        },
      ],
    };

    const response = await this._overkizPost('/exec/apply', payload);
    return response;
  }

  async getExecutionStatus(execId) {
    return this._overkizGet(`/exec/current/${execId}`);
  }

  // ── HTTP Layer ────────────────────────────────────────────────────

  _overkizHeaders() {
    return {
      Cookie: this._cookies,
      'Content-Type': 'application/json',
    };
  }

  async _overkizGet(path) {
    return this._request('GET', OVERKIZ_API, path, null, this._overkizHeaders());
  }

  async _overkizPost(path, data) {
    return this._request('POST', OVERKIZ_API, path, data ? JSON.stringify(data) : null, this._overkizHeaders());
  }

  /**
   * Login request that captures Set-Cookie headers.
   */
  _requestWithCookies(method, baseUrl, path, body, headers) {
    return new Promise((resolve, reject) => {
      const fullUrl = baseUrl.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
      const url = new URL(fullUrl);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers: headers || {},
        insecureHTTPParser: true,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const cookies = res.headers['set-cookie'] || [];
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }

          if (res.statusCode >= 400) {
            const error = new Error(`Overkiz API ${res.statusCode}: ${data}`);
            error.statusCode = res.statusCode;
            return reject(error);
          }

          resolve({ body: parsed, cookies });
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Overkiz request timed out')); });
      if (body) req.write(body);
      req.end();
    });
  }

  _request(method, baseUrl, path, body, headers) {
    return new Promise((resolve, reject) => {
      const fullUrl = baseUrl.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
      const url = new URL(fullUrl);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method,
        headers: headers || {},
        insecureHTTPParser: true,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            const error = new Error(`Overkiz API ${res.statusCode}: ${data}`);
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
        reject(new Error('Overkiz request timed out'));
      });

      if (body) req.write(body);
      req.end();
    });
  }

}

OverkizAPI.STATES = STATES;
OverkizAPI.COMMANDS = COMMANDS;
OverkizAPI.OVERKIZ_DEVICE_TYPES = OVERKIZ_DEVICE_TYPES;
OverkizAPI.OVERKIZ_API = OVERKIZ_API;

module.exports = OverkizAPI;
