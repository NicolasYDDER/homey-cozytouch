'use strict';

const Homey = require('homey');

/**
 * Base device class for all Cozytouch devices.
 * Handles both Cozytouch (Magellan) and Overkiz protocols transparently.
 */
class CozyTouchDevice extends Homey.Device {

  async onInit() {
    this.log(`Initializing device: ${this.getName()}`);

    const store = this.getStore();
    const data = this.getData();

    this._protocol = store.protocol || 'cozytouch';
    this.log(`Protocol: ${this._protocol}`);

    if (this._protocol === 'overkiz') {
      await this._initOverkiz(store, data);
    } else {
      await this._initCozytouch(store, data);
    }

    // Register capability listeners
    this._registerCapabilityListeners();

    // Start polling
    const settings = this.getSettings();
    const interval = (settings.poll_interval || 60) * 1000;
    this._pollInterval = this.homey.setInterval(() => this._poll(), interval);

    // Initial poll
    await this._poll();

    this.log(`Device initialized: ${this.getName()}`);
  }

  async _initCozytouch(store, data) {
    this._cozyDeviceId = store.cozyDeviceId;
    this._modelId = store.modelId;
    this._capabilityMap = store.capabilityMap || {};

    this._api = this.homey.app.getCozyTouchApi({
      username: data.username,
      password: data.password,
      deviceId: data.accountDeviceId,
    });

    if (!this._api.isAuthenticated()) {
      try {
        await this._api.authenticate();
      } catch (err) {
        this.error('CozyTouch auth failed:', err.message);
        this.setUnavailable(this.homey.__('errors.auth_failed')).catch(this.error);
      }
    }
  }

  async _initOverkiz(store, data) {
    this._deviceURL = store.deviceURL;
    this._uiClass = store.uiClass;

    this._overkizApi = this.homey.app.getOverkizApi({
      username: data.username,
      password: data.password,
    });

    if (!this._overkizApi.isAuthenticated()) {
      try {
        await this._overkizApi.authenticate();
      } catch (err) {
        this.error('Overkiz auth failed:', err.message);
        this.setUnavailable(this.homey.__('errors.auth_failed')).catch(this.error);
      }
    }
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

  // ── Polling ─────────────────────────────────────────────────────

  async _poll() {
    try {
      if (this._protocol === 'overkiz') {
        await this._pollOverkiz();
      } else {
        await this._pollCozytouch();
      }
      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('Poll failed:', err.message);
      await this._handlePollError(err);
    }
  }

  async _pollCozytouch() {
    const capabilities = await this._api.getCapabilities(this._cozyDeviceId);
    this._updateFromCozytouch(capabilities);
  }

  async _pollOverkiz() {
    const states = await this._overkizApi.getDeviceState(this._deviceURL);
    this._updateFromOverkiz(states);
  }

  async _handlePollError(err) {
    if (err.statusCode === 401) {
      try {
        if (this._protocol === 'overkiz') {
          await this._overkizApi.authenticate();
        } else {
          await this._api.authenticate();
        }
        await this._poll();
        return;
      } catch (retryErr) {
        this.error('Re-auth failed:', retryErr.message);
      }
    }
    this.setUnavailable(this.homey.__('errors.connection_failed')).catch(this.error);
  }

  // ── CozyTouch helpers ───────────────────────────────────────────

  _getCapValue(capabilities, capId) {
    if (!this._api) return null;
    return this._api.getCapabilityValue(capabilities, capId);
  }

  async _setCapValue(capId, value) {
    return this._api.setCapabilityValue(this._cozyDeviceId, capId, value);
  }

  // ── Overkiz helpers ─────────────────────────────────────────────

  _getStateValue(states, stateName) {
    const state = (states || []).find((s) => s.name === stateName);
    return state ? state.value : null;
  }

  async _executeOverkizCommand(commandName, parameters) {
    return this._overkizApi.executeCommand(this._deviceURL, commandName, parameters);
  }

  // ── Common helpers ──────────────────────────────────────────────

  _safeSetCapability(name, value) {
    if (value !== null && value !== undefined) {
      this.setCapabilityValue(name, value).catch(this.error);
    }
  }

  /**
   * Override in subclass for CozyTouch protocol updates.
   */
  _updateFromCozytouch(_capabilities) {}

  /**
   * Override in subclass for Overkiz protocol updates.
   */
  _updateFromOverkiz(_states) {}

  /**
   * Override in subclass to register device-specific capability listeners.
   */
  _registerCapabilityListeners() {}

}

module.exports = CozyTouchDevice;
