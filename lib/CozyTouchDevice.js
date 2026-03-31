'use strict';

const Homey = require('homey');

/**
 * Base device class for all Cozytouch devices.
 * Uses the handler pattern: subclasses implement _createHandler() to pick
 * the protocol-specific handler. All protocol logic lives in the handler,
 * keeping this base class and each device.js protocol-agnostic.
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

    // Start polling
    const settings = this.getSettings();
    const interval = (settings.poll_interval || 60) * 1000;
    this._pollInterval = this.homey.setInterval(() => this._poll(), interval);

    // Initial poll
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
    if (this._pollInterval) {
      this.homey.clearInterval(this._pollInterval);
    }
    this.log(`Device deleted: ${this.getName()}`);
  }

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.includes('poll_interval')) {
      if (this._pollInterval) {
        this.homey.clearInterval(this._pollInterval);
      }
      const interval = (newSettings.poll_interval || 60) * 1000;
      this._pollInterval = this.homey.setInterval(() => this._poll(), interval);
      this.log(`Poll interval updated to ${newSettings.poll_interval}s`);
    }
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
    if (value !== null && value !== undefined && this.hasCapability(name)) {
      this.setCapabilityValue(name, value).catch(this.error);
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
    });
  }

  /**
   * Override in subclass to register device-specific capability listeners.
   * Listeners should delegate to this._handler methods.
   */
  _registerCapabilityListeners() {}

}

module.exports = CozyTouchDevice;
