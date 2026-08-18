'use strict';

const Homey = require('homey');
const { describeDiscoveredDevices } = require('./helpers/discovery-report');

/**
 * Base driver class for all Cozytouch drivers.
 * Handles the pairing flow with login + device listing.
 * Discovers devices from both Cozytouch (Magellan) and Overkiz protocols.
 * Reuses app Settings credentials when available (Homey system login_credentials view).
 */
class CozyTouchDriver extends Homey.Driver {

  async onInit() {
    this.log(`Driver initialized: ${this.constructor.name}`);
  }

  async onPair(session) {
    let username = '';
    let password = '';
    let devices = [];
    let allDiscovered = [];
    let discovered = false;

    const discoverForDriver = async (user, pass) => {
      allDiscovered = await this.homey.app.discoverDevices({
        username: user,
        password: pass,
      });
      const filtered = this._filterDevices(allDiscovered);
      if (filtered.length === 0) {
        throw this._noDevicesError(allDiscovered);
      }
      return filtered;
    };

    // Never await showView — can hang on some Homey versions.
    const goTo = (viewId) => {
      session.showView(viewId).catch((err) => {
        this.error(`showView(${viewId}) failed:`, err.message);
      });
    };

    /**
     * Starts on Homey system login_credentials.
     * If reusable credentials exist, jump straight to list_devices (no cloud call here).
     */
    session.setHandler('showView', async (viewId) => {
      if (viewId !== 'login_credentials') return;

      // Only app Settings — so Clear Credentials forces the login form again.
      const saved = this.homey.app.getCredentials();
      if (!saved) {
        this.log('Pairing: showing login form');
        return;
      }

      username = saved.username;
      password = saved.password;
      this.log(`Pairing: skip login (credentials for ${username})`);
      goTo('list_devices');
    });

    session.setHandler('login', async (data) => {
      username = data.username;
      password = data.password;

      try {
        // Auth OK → save, then always continue to list_devices.
        // Do not throw here: Homey would show a JS alert and stay on login
        // even though credentials are already stored.
        allDiscovered = await this.homey.app.discoverDevices({ username, password });
        this.homey.app.saveCredentials(username, password);
        devices = this._filterDevices(allDiscovered);
        discovered = true;
        return true;
      } catch (err) {
        this.error('Login failed:', err.message);
        throw new Error(err.message);
      }
    });

    session.setHandler('list_devices', async () => {
      try {
        if (!discovered) {
          if (!username || !password) {
            throw new Error(this.homey.__('errors.auth_failed'));
          }
          devices = await discoverForDriver(username, password);
          discovered = true;
        } else if (devices.length === 0) {
          throw this._noDevicesError(allDiscovered);
        }
        const mapped = devices.map((dev) => this._mapDevice(dev, username, password));
        this.log(`Listing ${mapped.length} device(s) for pairing:`, mapped.map((d) => d.name));
        return mapped;
      } catch (err) {
        this.error('list_devices failed:', err.message, err.stack);
        throw err;
      }
    });
  }

  /**
   * Filter devices relevant to this driver from combined protocol results.
   * Override in subclass.
   */
  _filterDevices(_allDevices) {
    return [];
  }

  /**
   * The account has devices but none for this driver. Name what was found, so
   * the alert and the app log say which product is missing support instead of
   * just "no compatible device".
   */
  _noDevicesError(allDevices) {
    const message = this.homey.__('pair.no_devices');
    const found = describeDiscoveredDevices(allDevices);
    if (!found) {
      return new Error(message);
    }
    return new Error(`${message} — ${found}`);
  }

  /**
   * Map a device to Homey format. Dispatches to protocol-specific mapper.
   */
  _mapDevice(device, username, password) {
    if (device._protocol === 'overkiz') {
      return this._mapOverkizDevice(device, username, password);
    }
    return this._mapCozyTouchDevice(device, username, password);
  }

  /**
   * Map a Cozytouch/Magellan device to Homey format.
   */
  _mapCozyTouchDevice(dev, username, password) {
    return {
      name: dev.name || `Cozytouch ${dev.deviceId}`,
      data: {
        id: `cozy_${dev.deviceId}`,
        username,
        password,
        accountDeviceId: String(dev.deviceId),
      },
      store: {
        protocol: 'cozytouch',
        cozyDeviceId: dev.deviceId,
        modelId: dev.modelId,
        productId: dev.productId,
        gatewaySerialNumber: dev.gatewaySerialNumber,
        zoneId: dev.zoneId,
        capabilityMap: {},
      },
    };
  }

  /**
   * Map an Overkiz device to Homey format.
   */
  _mapOverkizDevice(dev, username, password) {
    // Sanitize deviceURL for use as Homey device ID (remove ://, #, etc.)
    const safeId = (dev.deviceURL || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      name: dev.label || dev.name || `Overkiz ${dev.deviceURL}`,
      data: {
        id: `ovkz_${safeId}`,
        username,
        password,
      },
      store: {
        protocol: 'overkiz',
        deviceURL: dev.deviceURL,
        uiClass: dev.uiClass || dev.ui_class || '',
        controllableName: dev.controllableName || dev.controllable_name || '',
        widget: dev.widget || '',
        gatewayId: dev.gatewayId || dev.gateway_id || '',
        // Snapshot initial states for reference
        initialStates: (dev.states || []).map((s) => ({ name: s.name, value: s.value })),
      },
    };
  }

}

module.exports = CozyTouchDriver;
