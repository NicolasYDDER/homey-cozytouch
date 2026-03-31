'use strict';

const Homey = require('homey');
/**
 * Base driver class for all Cozytouch drivers.
 * Handles the pairing flow with login + device listing.
 */
class CozyTouchDriver extends Homey.Driver {

  async onInit() {
    this.log(`Driver initialized: ${this.constructor.name}`);
  }

  /**
   * Called during pairing. Handles the login_credentials and list_devices views.
   */
  async onPair(session) {
    let username = '';
    let password = '';
    let deviceId = '';
    let devices = [];

    session.setHandler('login', async (data) => {
      username = data.username;
      password = data.password;

      // Use a temporary deviceId for discovery
      deviceId = '';

      try {
        const allDevices = await this.homey.app.discoverDevices({
          username,
          password,
          deviceId,
        });

        // Filter devices for this driver type
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
      return devices.map((dev) => this._mapDevice(dev, username, password));
    });
  }

  /**
   * Filter Cozytouch devices relevant to this driver.
   * Override in subclass.
   */
  _filterDevices(allDevices) {
    return allDevices;
  }

  /**
   * Map a Cozytouch device object to a Homey device object.
   * Override in subclass to set specific capabilities and store.
   */
  _mapDevice(cozytouchDevice, username, password) {
    return {
      name: cozytouchDevice.name || `Cozytouch ${cozytouchDevice.deviceId}`,
      data: {
        id: String(cozytouchDevice.deviceId),
        username,
        password,
        accountDeviceId: String(cozytouchDevice.deviceId),
      },
      store: {
        cozyDeviceId: cozytouchDevice.deviceId,
        modelId: cozytouchDevice.modelId,
        productId: cozytouchDevice.productId,
        gatewaySerialNumber: cozytouchDevice.gatewaySerialNumber,
        zoneId: cozytouchDevice.zoneId,
        capabilityMap: {},
      },
    };
  }

}

module.exports = CozyTouchDriver;
