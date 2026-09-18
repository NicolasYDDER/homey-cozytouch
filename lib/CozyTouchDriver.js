'use strict';

const Homey = require('homey');
const { describeDiscoveredDevices } = require('./helpers/discovery-report');
const {
  groupByClaimingDriver,
  describeClaimingDrivers,
  localizedName,
} = require('./helpers/driver-claims');
const { supportedCommandNames } = require('./helpers/overkiz-commands');
const { excludeAlreadyPaired } = require('./helpers/pairing');

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
        const mapped = devices.map((dev) => this._mapDevice(dev));
        // Homey filters on full `data` equality; pre-1.3.7 devices still have
        // credentials in data, so match on id (see helpers/pairing.js).
        const available = excludeAlreadyPaired(mapped, this.getDevices());
        this.log(
          `Listing ${available.length}/${mapped.length} device(s) for pairing:`,
          available.map((d) => d.name),
        );
        return available;
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
   * The account has devices but none for this driver. Name the device types that
   * *would* pair them, so the alert sends the user to the right tile instead of
   * letting them conclude the app does not support their product at all.
   */
  _noDevicesError(allDevices) {
    const message = this.homey.__('pair.no_devices');
    const found = describeDiscoveredDevices(allDevices);
    if (!found) {
      this.error('No device at all was discovered for this account');
      return new Error(message);
    }

    // The alert keeps the short lists — it has to stay readable in a dialog —
    // but the log gets every device. A product such as the Alféa Pass APC heat
    // pump publishes a dozen endpoints, and the one that identifies it can be
    // anywhere in that list; a capped log line hides exactly what a support
    // report needs (see the "+5" that made issue triage need extra data).
    const all = describeDiscoveredDevices(allDevices, Number.POSITIVE_INFINITY);
    this.error(`No compatible device for this driver among ${allDevices.length} discovered: ${all}`);

    const { claimed, unclaimed } = groupByClaimingDriver(allDevices, this._otherDrivers(allDevices));
    const elsewhere = describeClaimingDrivers(claimed);
    if (elsewhere) {
      this.error(`Other device types would pair: ${describeClaimingDrivers(claimed, Number.POSITIVE_INFINITY)}`);
    }
    if (unclaimed.length > 0) {
      this.error(`Supported by no device type: ${describeDiscoveredDevices(unclaimed, Number.POSITIVE_INFINITY)}`);
    }

    const parts = [message];
    if (elsewhere) parts.push(`${this.homey.__('pair.try_other_drivers')} ${elsewhere}`);
    // Unsupported devices keep their modelId: that is what a report needs, and
    // the user has nothing to do with them beyond sending it.
    if (unclaimed.length > 0) {
      parts.push(`${this.homey.__('pair.unsupported')} ${describeDiscoveredDevices(unclaimed)}`);
    }
    // Nothing else claims anything: the plain list of what was found is still
    // the most useful thing to show, as it names the model support is keyed on.
    if (parts.length === 1) parts.push(found);
    return new Error(parts.join(' — '));
  }

  /**
   * Every other driver of this app, paired with what it would take from this
   * discovery. Each filter runs once on the whole list rather than per device:
   * some drivers read the list for sibling context, and per-device calls would
   * both lose that and rewrite their state one device at a time.
   *
   * @returns {Array<{name: string, claims: function(object): boolean}>}
   */
  _otherDrivers(allDevices) {
    let registry = {};
    try {
      registry = this.homey.drivers.getDrivers() || {};
    } catch (err) {
      this.error('Could not list the other drivers:', err.message);
      return [];
    }

    const manifests = (this.homey.manifest && this.homey.manifest.drivers) || [];
    const language = (this.homey.i18n && typeof this.homey.i18n.getLanguage === 'function')
      ? this.homey.i18n.getLanguage()
      : 'en';

    return Object.entries(registry)
      // Identity, not id: the driver that just found nothing has nothing to add,
      // and comparing objects needs no assumption about the SDK's id property.
      .filter(([, driver]) => driver && driver !== this)
      .map(([id, driver]) => {
        const manifest = manifests.find((entry) => entry && entry.id === id);
        const name = localizedName(manifest && manifest.name, language) || id;

        let claimed = new Set();
        try {
          claimed = new Set(driver._filterDevices(allDevices));
        } catch (err) {
          this.error(`Driver ${id} failed to filter the discovery:`, err.message);
        }
        return { name, claims: (dev) => claimed.has(dev) };
      });
  }

  /**
   * Map a device to Homey format. Dispatches to protocol-specific mapper.
   *
   * The account credentials deliberately stay out of `data`: they live only in
   * app settings (see CozyTouchApp.getCredentials), so a device object that
   * gets logged or exported never carries them.
   */
  _mapDevice(device) {
    if (device._protocol === 'overkiz') {
      return this._mapOverkizDevice(device);
    }
    return this._mapCozyTouchDevice(device);
  }

  /**
   * Map a Cozytouch/Magellan device to Homey format.
   */
  _mapCozyTouchDevice(dev) {
    return {
      name: dev.name || `Cozytouch ${dev.deviceId}`,
      data: {
        id: `cozy_${dev.deviceId}`,
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
  _mapOverkizDevice(dev) {
    // Sanitize deviceURL for use as Homey device ID (remove ://, #, etc.)
    const safeId = (dev.deviceURL || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      name: dev.label || dev.name || `Overkiz ${dev.deviceURL}`,
      data: {
        id: `ovkz_${safeId}`,
      },
      store: {
        protocol: 'overkiz',
        deviceURL: dev.deviceURL,
        uiClass: dev.uiClass || dev.ui_class || '',
        controllableName: dev.controllableName || dev.controllable_name || '',
        widget: dev.widget || '',
        gatewayId: dev.gatewayId || dev.gateway_id || '',
        // What this endpoint says it accepts. Command names differ between
        // products of the same Overkiz family, so handlers pick from this list
        // instead of guessing per model.
        overkizCommands: supportedCommandNames(dev),
        // Snapshot initial states for reference
        initialStates: (dev.states || []).map((s) => ({ name: s.name, value: s.value })),
      },
    };
  }

}

module.exports = CozyTouchDriver;
