'use strict';

const Homey = require('homey');
const {
  capabilityIdsOf,
  describeCapabilities,
  unsupportedCapabilityType,
} = require('./helpers/magellan-capabilities');

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
        this._readMagellanCapabilities(ctx, store);
      ctx.getCapValue = (caps, capId) => {
        const value = ctx.api.getCapabilityValue(caps, capId);
        this._noteCapabilityRead(capId, value);
        return value;
      };
      ctx.setCapValue = (capId, value) =>
        this._writeMagellanCapability(ctx, store, capId, value);
    }

    return ctx;
  }

  // ── Magellan capability plumbing ────────────────────────────────
  //
  // Magellan answers per product, not per model: a device this app classifies
  // as a water heater may implement none of the capability IDs the handler
  // reads. Nothing used to say so — the tile just stayed empty and every write
  // came back as an opaque 404 ("no implementation for capability Id 2 on
  // product Id 7"). The three wrappers below keep that case visible: dump what
  // the device does report, count how many mapped IDs matched, and translate
  // the API's capability errors.

  _magellanIdentity(store) {
    const modelId = store.modelId === undefined || store.modelId === null ? '?' : store.modelId;
    const productId = store.productId === undefined || store.productId === null ? '?' : store.productId;
    return `modelId ${modelId}, productId ${productId}`;
  }

  _reportedCapabilityIds() {
    const ids = this._magellanCapabilityIds;
    if (!ids || ids.size === 0) return 'nothing';
    return [...ids].sort((a, b) => a - b).join(', ');
  }

  /**
   * Read the capability payload for a Magellan device. Some products answer the
   * per-device endpoint with an empty list while the setup view carries their
   * values, so fall back to it rather than showing an empty device.
   */
  async _readMagellanCapabilities(ctx, store) {
    let caps = await ctx.api.getCapabilities(store.cozyDeviceId);
    let source = 'capabilities endpoint';

    if (capabilityIdsOf(caps).size === 0) {
      let fromSetup = [];
      try {
        fromSetup = await ctx.api.getSetupCapabilities(store.cozyDeviceId);
      } catch (err) {
        this.error('Setup capability fallback failed:', err.message);
      }
      if (capabilityIdsOf(fromSetup).size > 0) {
        caps = fromSetup;
        source = 'setup view';
      }
    }

    this._magellanCapabilityIds = capabilityIdsOf(caps);
    this._capabilityReads = { hits: 0, missed: [] };

    // Once per app run: this line is what a diagnostic report needs to map an
    // unsupported product (see issue #5, which needed a full log to act on).
    if (!this._capabilityDumpLogged) {
      this._capabilityDumpLogged = true;
      this.log(`Magellan capabilities (${this._magellanIdentity(store)}, ${source}): ${describeCapabilities(caps)}`);
    }

    return caps;
  }

  _noteCapabilityRead(capId, value) {
    if (!this._capabilityReads) return;
    if (value === null || value === undefined) {
      this._capabilityReads.missed.push(capId);
    } else {
      this._capabilityReads.hits += 1;
    }
  }

  /**
   * Write one Magellan capability, turning "this product has no such
   * capability" into a message the user can act on instead of raw API JSON.
   */
  async _writeMagellanCapability(ctx, store, capId, value) {
    try {
      return await ctx.api.setCapabilityValue(store.cozyDeviceId, capId, value);
    } catch (err) {
      const type = unsupportedCapabilityType(err);
      if (!type) throw err;

      this.error(`Capability ${capId} is not available on this device (${type}, ${this._magellanIdentity(store)}); it reports: ${this._reportedCapabilityIds()}`);
      const readable = new Error(`${this.homey.__('errors.capability_not_supported')} (capability ${capId})`);
      readable.capabilityUnsupported = true;
      readable.statusCode = err.statusCode;
      readable.body = err.body;
      throw readable;
    }
  }

  /**
   * After a Magellan poll: if not a single mapped capability matched, the device
   * looks healthy while showing nothing at all. Log what it does report and
   * warn on the tile, once, so the user knows to send a diagnostic report.
   */
  _reportCapabilityCoverage(store) {
    const reads = this._capabilityReads;
    if (!reads || (reads.hits === 0 && reads.missed.length === 0)) return;

    if (reads.hits > 0) {
      if (this._capabilityWarningSet) {
        this._capabilityWarningSet = false;
        this.unsetWarning().catch(this.error);
      }
      return;
    }

    if (this._capabilityWarningSet) return;
    this._capabilityWarningSet = true;
    this.error(`None of the capabilities this app reads exist on this device (${this._magellanIdentity(store)}): looked for ${reads.missed.join(', ')}, device reports ${this._reportedCapabilityIds()}`);
    this.setWarning(this.homey.__('errors.capabilities_unmapped')).catch(this.error);
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
      // Diagnostics only: never let it turn a successful poll into a failure.
      try {
        this._reportCapabilityCoverage(this.getStore());
      } catch (err) {
        this.error('Capability coverage check failed:', err.message);
      }
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
