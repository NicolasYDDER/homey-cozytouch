'use strict';

const Homey = require('homey');

/**
 * Capability → Flow trigger cards. Homey only fires the cards it generates
 * itself (system capabilities such as target_temperature); the cards this app
 * declares in app.json have to be triggered explicitly, otherwise they show up
 * in the Flow editor but never run.
 *
 * `token` is the token filled with the new value, `when` restricts a card to one
 * boolean value, `drivers` restricts it to the drivers the card is filtered on.
 */
const CAPABILITY_TRIGGERS = {
  measure_temperature: [{ id: 'measure_temperature_changed', token: 'temperature' }],
  cozytouch_heating_mode: [{ id: 'heating_mode_changed', token: 'mode' }],
  cozytouch_pass_level: [{ id: 'pass_cozytouch_level_changed', token: 'level' }],
  cozytouch_hvac_mode: [
    { id: 'zone_control_hvac_mode_changed', token: 'mode', drivers: ['zone_control'] },
  ],
  cozytouch_boost: [
    { id: 'boost_turned_on', when: true },
    { id: 'boost_turned_off', when: false },
  ],
  cozytouch_away_mode: [
    { id: 'away_mode_turned_on', when: true },
    { id: 'away_mode_turned_off', when: false },
  ],
};

/**
 * Base device class for all Cozytouch devices.
 * Uses the handler pattern: subclasses implement _createHandler() to pick
 * the protocol-specific handler. All protocol logic lives in the handler,
 * keeping this base class and each device.js protocol-agnostic.
 *
 * All devices are polled by the app sync cycle (one interval in app settings).
 * Overkiz devices also get refreshStates() before that poll.
 */
class CozyTouchDevice extends Homey.Device {

  async onInit() {
    this.log(`Initializing device: ${this.getName()}`);

    const store = this.getStore();
    const data = this.getData();
    this._protocol = store.protocol || 'cozytouch';
    this.log(`Protocol: ${this._protocol}`);

    // Subclass creates the handler via _createHandler()
    this._handler = this._createHandler(store, data);

    // Ensure authenticated
    if (this._handler.ctx.api && !this._handler.ctx.api.isAuthenticated()) {
      try {
        await this._handler.ctx.api.authenticate();
      } catch (err) {
        this.error('Auth failed:', err.message);
        this.setUnavailable(this.homey.__('errors.auth_failed')).catch(this.error);
        return;
      }
    }

    // Register capability listeners (subclass implements)
    this._registerCapabilityListeners();

    this.homey.app.registerSyncedDevice(this);
    // Initial read; global cycle will refresh Overkiz afterwards
    await this._poll();

    this.log(`Device initialized: ${this.getName()}`);
  }

  /**
   * Subclass MUST override. Returns the protocol-specific handler.
   */
  _createHandler(_store, _data) {
    throw new Error('_createHandler must be implemented by subclass');
  }

  /**
   * Build the context object passed to handlers.
   * Provides API access and helper functions without exposing the Homey Device.
   */
  _buildHandlerContext(store, data) {
    const ctx = {
      log: this.log.bind(this),
      error: this.error.bind(this),
      setCapability: this._safeSetCapability.bind(this),
      setCapabilityOptions: (name, opts) =>
        this.setCapabilityOptions(name, opts).catch(this.error),
      hasCapability: this.hasCapability.bind(this),
      store,
      data,
    };

    if (this._protocol === 'overkiz') {
      ctx.api = this.homey.app.getOverkizApi({
        username: data.username,
        password: data.password,
      });
      ctx.deviceURL = store.deviceURL;
      ctx.executeCommand = (cmd, params) =>
        ctx.api.executeCommand(store.deviceURL, cmd, params);
      ctx.getDeviceState = () =>
        ctx.api.getDeviceState(store.deviceURL);
    } else {
      ctx.api = this.homey.app.getCozyTouchApi({
        username: data.username,
        password: data.password,
        deviceId: data.accountDeviceId,
      });
      ctx.cozyDeviceId = store.cozyDeviceId;
      ctx.getCapabilities = () =>
        ctx.api.getCapabilities(store.cozyDeviceId);
      ctx.getCapValue = (caps, capId) =>
        ctx.api.getCapabilityValue(caps, capId);
      ctx.setCapValue = (capId, value) =>
        ctx.api.setCapabilityValue(store.cozyDeviceId, capId, value);
    }

    return ctx;
  }

  async onDeleted() {
    this.homey.app.unregisterSyncedDevice(this);
    this.log(`Device deleted: ${this.getName()}`);
  }

  /**
   * Called by the app sync cycle (after Overkiz refreshStates when applicable).
   */
  async pollFromApp() {
    return this._poll();
  }

  getOverkizApi() {
    if (this._protocol !== 'overkiz' || !this._handler || !this._handler.ctx) {
      return null;
    }
    return this._handler.ctx.api || null;
  }

  async _poll() {
    try {
      await this._handler.updateState();
      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('Poll failed:', err.message);
      await this._handlePollError(err);
    }
  }

  async _handlePollError(err) {
    if (err.statusCode === 401) {
      try {
        await this._handler.ctx.api.authenticate();
        await this._handler.updateState();
        this.setAvailable().catch(this.error);
        return;
      } catch (retryErr) {
        this.error('Re-auth failed:', retryErr.message);
      }
    }
    this.setUnavailable(this.homey.__('errors.connection_failed')).catch(this.error);
  }

  _safeSetCapability(name, value) {
    if (value === null || value === undefined || !this.hasCapability(name)) {
      return;
    }
    const previous = this.getCapabilityValue(name);
    this.setCapabilityValue(name, value)
      .then(() => {
        // Skip the first read after a restart (previous is null): that is the
        // device reporting where it already was, not a change.
        if (previous !== null && previous !== undefined && previous !== value) {
          this._fireCapabilityTriggers(name, value);
        }
      })
      .catch(this.error);
  }

  /**
   * Fire the app's Flow triggers bound to a capability that just changed.
   */
  _fireCapabilityTriggers(name, value) {
    const triggers = CAPABILITY_TRIGGERS[name];
    if (!triggers) {
      return;
    }
    // The same value can reach us twice (tile change, then the follow-up poll),
    // so never fire a value twice in a row for the same capability.
    if (!this._lastFiredValues) {
      this._lastFiredValues = {};
    }
    if (this._lastFiredValues[name] === value) {
      return;
    }
    this._lastFiredValues[name] = value;
    const driverId = (this.driver && this.driver.id) || null;
    for (const trigger of triggers) {
      if (trigger.drivers && driverId && !trigger.drivers.includes(driverId)) {
        continue;
      }
      if ('when' in trigger && trigger.when !== value) {
        continue;
      }
      const tokens = trigger.token ? { [trigger.token]: value } : {};
      try {
        this.homey.flow.getDeviceTriggerCard(trigger.id)
          .trigger(this, tokens)
          .catch((err) => this.error(`[flow] ${trigger.id} failed:`, err.message));
      } catch (err) {
        this.error(`[flow] ${trigger.id} unavailable:`, err.message);
      }
    }
  }

  /**
   * Register a capability listener with automatic error logging.
   * Errors are logged to the console AND re-thrown so Homey shows a notification.
   */
  _registerCapability(name, handler) {
    this.registerCapabilityListener(name, async (value) => {
      this.log(`[${name}] Setting to: ${value}`);
      try {
        await handler(value);
      } catch (err) {
        this.error(`[${name}] Command failed:`, err.message, err.body || '');
        throw err;
      }
      // Changes made from the device tile are stored by Homey itself and never
      // pass through _safeSetCapability, so fire the app's triggers here too.
      this._fireCapabilityTriggers(name, value);
    });
  }

  /**
   * Override in subclass to register device-specific capability listeners.
   * Listeners should delegate to this._handler methods.
   */
  _registerCapabilityListeners() {}

}

module.exports = CozyTouchDevice;
