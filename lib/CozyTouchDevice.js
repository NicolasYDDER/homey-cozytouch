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
    { id: 'hvac_mode_changed', token: 'mode', drivers: ['climate', 'heat_pump'] },
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

    this._credentials = this._resolveCredentials(data);
    if (!this._credentials) {
      this.error('No Cozytouch credentials in app settings');
      this.setUnavailable(this.homey.__('errors.no_credentials')).catch(this.error);
      this._waitForCredentials(store, data);
      return;
    }

    await this._start(store, data);
  }

  /**
   * Nothing can talk to the cloud until the account is in app settings, so a
   * device that starts without one comes up unavailable and waits instead of
   * staying dead until the next app restart.
   */
  _waitForCredentials(store, data) {
    if (this._credentialsListener) return;

    this._credentialsListener = (key) => {
      if (key !== 'credentials') return;
      const saved = this.homey.app.getCredentials();
      if (!saved) return;

      this.homey.settings.removeListener('set', this._credentialsListener);
      this._credentialsListener = null;
      this._credentials = saved;
      this.log('Credentials saved in app settings, starting device');
      this._start(store, data).catch((err) => this.error('Deferred init failed:', err.message));
    };

    this.homey.settings.on('set', this._credentialsListener);
  }

  /**
   * Build the handler, authenticate and join the sync cycle. Runs exactly once
   * per device — capability listeners must not be registered twice.
   */
  async _start(store, data) {
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
   * The Cozytouch account lives in app settings only, so it is stored in one
   * place instead of once per device. Devices paired before that change kept a
   * copy in their `data` object; `data` is immutable, so the best we can do is
   * move it to app settings the first time such a device starts up and read the
   * account from there from then on.
   */
  _resolveCredentials(data) {
    const saved = this.homey.app.getCredentials();
    if (saved) return saved;

    if (data.username && data.password) {
      this.log('Migrating credentials from device data to app settings');
      this.homey.app.saveCredentials(data.username, data.password);
      return this.homey.app.getCredentials();
    }

    return null;
  }

  /**
   * Build the context object passed to handlers.
   * Provides API access and helper functions without exposing the Homey Device.
   */
  _buildHandlerContext(store, data) {
    // A device paired by an earlier version still has the account in its data;
    // handlers only ever need the identifiers, so hand them a copy without it.
    const publicData = { ...data };
    delete publicData.username;
    delete publicData.password;

    const ctx = {
      log: this.log.bind(this),
      error: this.error.bind(this),
      setCapability: this._safeSetCapability.bind(this),
      setCapabilityOptions: (name, opts) =>
        this.setCapabilityOptions(name, opts).catch(this.error),
      hasCapability: this.hasCapability.bind(this),
      store,
      data: publicData,
    };

    const { username, password } = this._credentials;

    if (this._protocol === 'overkiz') {
      ctx.api = this.homey.app.getOverkizApi({ username, password });
      ctx.deviceURL = store.deviceURL;
      ctx.executeCommand = (cmd, params) =>
        ctx.api.executeCommand(store.deviceURL, cmd, params);
      ctx.getDeviceState = () =>
        ctx.api.getDeviceState(store.deviceURL);
    } else {
      ctx.api = this.homey.app.getCozyTouchApi({
        username,
        password,
        deviceId: publicData.accountDeviceId,
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
    if (this._credentialsListener) {
      this.homey.settings.removeListener('set', this._credentialsListener);
      this._credentialsListener = null;
    }
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
