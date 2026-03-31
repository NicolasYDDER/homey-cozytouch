'use strict';

const Homey = require('homey');

/**
 * Base device class for all Cozytouch devices.
 * Handles polling, authentication, and capability sync.
 */
class CozyTouchDevice extends Homey.Device {

  async onInit() {
    this.log(`Initializing device: ${this.getName()}`);

    const store = this.getStore();
    this._cozyDeviceId = store.cozyDeviceId;
    this._modelId = store.modelId;
    this._capabilityMap = store.capabilityMap || {};

    // Get shared API instance from app
    const settings = this.getSettings();
    const data = this.getData();

    this._api = this.homey.app.getApiInstance({
      username: data.username,
      password: data.password,
      deviceId: data.accountDeviceId,
    });

    // Ensure authenticated
    if (!this._api.isAuthenticated()) {
      try {
        await this._api.authenticate();
      } catch (err) {
        this.error('Authentication failed:', err.message);
        this.setUnavailable(this.homey.__('errors.auth_failed')).catch(this.error);
        return;
      }
    }

    // Register capability listeners
    this._registerCapabilityListeners();

    // Start polling
    const interval = (settings.poll_interval || 60) * 1000;
    this._pollInterval = this.homey.setInterval(() => this._poll(), interval);

    // Initial poll
    await this._poll();

    this.log(`Device initialized: ${this.getName()}`);
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
      const capabilities = await this._api.getCapabilities(this._cozyDeviceId);
      this._updateFromCapabilities(capabilities);
      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('Poll failed:', err.message);

      // Try to re-authenticate on 401
      if (err.statusCode === 401) {
        try {
          await this._api.authenticate();
          const capabilities = await this._api.getCapabilities(this._cozyDeviceId);
          this._updateFromCapabilities(capabilities);
          this.setAvailable().catch(this.error);
        } catch (retryErr) {
          this.error('Re-auth failed:', retryErr.message);
          this.setUnavailable(this.homey.__('errors.connection_failed')).catch(this.error);
        }
      } else {
        this.setUnavailable(this.homey.__('errors.connection_failed')).catch(this.error);
      }
    }
  }

  /**
   * Update Homey capabilities from Cozytouch capability data.
   * Override in subclass for device-specific mapping.
   */
  _updateFromCapabilities(_capabilities) {
    // Override in subclass
  }

  // ── Helpers ─────────────────────────────────────────────────────

  _getCapValue(capabilities, capId) {
    return this._api.getCapabilityValue(capabilities, capId);
  }

  async _setCapValue(capId, value) {
    return this._api.setCapabilityValue(this._cozyDeviceId, capId, value);
  }

  _safeSetCapability(name, value) {
    if (value !== null && value !== undefined) {
      this.setCapabilityValue(name, value).catch(this.error);
    }
  }

  /**
   * Override in subclass to register device-specific capability listeners.
   */
  _registerCapabilityListeners() {
    // Override in subclass
  }

}

module.exports = CozyTouchDevice;
