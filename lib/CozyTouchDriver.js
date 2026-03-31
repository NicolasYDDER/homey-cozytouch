'use strict';

const Homey = require('homey');

/**
 * Base driver class for all Cozytouch drivers.
 * Handles the pairing flow with login + device listing.
 * Discovers devices from both Cozytouch (Magellan) and Overkiz protocols.
 */
class CozyTouchDriver extends Homey.Driver {

  async onInit() {
    this.log(`Driver initialized: ${this.constructor.name}`);
  }

  async onPair(session) {
    let username = '';
    let password = '';
    let devices = [];

    session.setHandler('login', async (data) => {
      username = data.username;
      password = data.password;

      try {
        const allDevices = await this.homey.app.discoverDevices({ username, password });

        // Filter devices for this driver type (handles both protocols)
        devices = this._filterDevices(allDevices);

        if (devices.length === 0) {
          throw new Error(this.homey.__('pair.no_devices'));
        }

        return true;
      } catch (err) {
        this.error('Login failed:', err.message);
        throw new Error(err.message);
      }
    });

    session.setHandler('list_devices', async () => {
      try {
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
      name: dev.label || `Overkiz ${dev.deviceURL}`,
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
