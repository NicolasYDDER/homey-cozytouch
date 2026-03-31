'use strict';

/**
 * CozyTouch handler for towel racks.
 *
 * Towel rack capability IDs vary by model/product. Instead of hardcoding IDs,
 * this handler discovers them dynamically from the first poll response by
 * matching capability names and types.
 */
class TowelRackCozytouchHandler {

  constructor(ctx) {
    this.ctx = ctx;
    this._capMap = null; // Populated on first poll
  }

  // ── Commands (guarded: only write if cap was discovered) ──────

  async setTargetTemperature(value) {
    const capId = this._findCap('target_temperature', 'temperature');
    if (capId !== null) {
      await this.ctx.setCapValue(capId, value);
    } else {
      this.ctx.log('No target temperature capability found for this device');
    }
  }

  async setOnOff(value) {
    // Try dedicated on/off first, fall back to mode
    const onOffCap = this._findCap('on_off', 'switch');
    if (onOffCap !== null) {
      await this.ctx.setCapValue(onOffCap, value ? '1' : '0');
    } else {
      // No on/off cap - use mode: find the mode-like capability
      await this.setMode(value ? 'manual' : 'off');
      return;
    }
    this.ctx.setCapability('cozytouch_heating_mode', value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const modeCap = this._findCap('mode', 'heating_mode');
    if (modeCap !== null) {
      // Try standard mode values
      const modeMap = { off: '0', manual: '1', eco_plus: '3', prog: '4' };
      const apiValue = modeMap[mode];
      if (apiValue !== undefined) {
        await this.ctx.setCapValue(modeCap, apiValue);
      }
    } else {
      this.ctx.log('No mode capability found for this device');
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  // ── Polling ───────────────────────────────────────────────────

  async updateState() {
    const caps = await this.ctx.getCapabilities();

    // First poll: discover and log all capabilities
    if (!this._capMap) {
      this._discoverCapabilities(caps);
    }

    // Read values using discovered IDs
    this._readTemperature(caps);
    this._readTargetTemperature(caps);
    this._readMode(caps);
    this._readTempBounds(caps);
  }

  // ── Dynamic capability discovery ──────────────────────────────

  _discoverCapabilities(caps) {
    this._capMap = {};

    this.ctx.log('=== CozyTouch Capability Discovery ===');
    this.ctx.log(`Found ${caps.length} capabilities:`);

    for (const cap of caps) {
      const name = (cap.name || '').toLowerCase();
      const type = (cap.type || '').toLowerCase();
      const category = (cap.category || '').toLowerCase();

      this.ctx.log(`  [${cap.capabilityId}] "${cap.name}" type=${cap.type} category=${cap.category} value=${cap.value}`);

      // Temperature sensors
      if (type === 'temperature' && category === 'sensor') {
        if (!this._capMap.current_temperature) {
          this._capMap.current_temperature = cap.capabilityId;
        }
      }

      // Target temperature (settable temperature)
      if (type === 'temperature' && category !== 'sensor') {
        this._capMap.target_temperature = cap.capabilityId;
      }
      if (name.includes('target') && type === 'temperature') {
        this._capMap.target_temperature = cap.capabilityId;
      }
      if (name.includes('consigne') || name.includes('setpoint')) {
        this._capMap.target_temperature = cap.capabilityId;
      }

      // On/Off switch
      if (type === 'switch' || type === 'binary') {
        if (name.includes('on') || name.includes('off') || name.includes('power')) {
          this._capMap.on_off = cap.capabilityId;
        }
      }

      // Heating mode
      if (name.includes('mode') || name.includes('heating')) {
        if (type === 'string' || type === 'int' || type === 'select') {
          this._capMap.heating_mode = cap.capabilityId;
        }
      }

      // Min/Max temperature bounds
      if (name.includes('min') && type === 'temperature') {
        this._capMap.min_temp = cap.capabilityId;
      }
      if (name.includes('max') && type === 'temperature') {
        this._capMap.max_temp = cap.capabilityId;
      }
    }

    this.ctx.log('Discovered capability map:', JSON.stringify(this._capMap));
    this.ctx.log('=== End Discovery ===');
  }

  _findCap(key, fallbackKey) {
    if (!this._capMap) return null;
    return this._capMap[key] || this._capMap[fallbackKey] || null;
  }

  // ── State readers ─────────────────────────────────────────────

  _readTemperature(caps) {
    const capId = this._capMap.current_temperature;
    if (capId === undefined) return;
    const val = this.ctx.getCapValue(caps, capId);
    if (val !== null) this.ctx.setCapability('measure_temperature', parseFloat(val));
  }

  _readTargetTemperature(caps) {
    const capId = this._capMap.target_temperature;
    if (capId === undefined) return;
    const val = this.ctx.getCapValue(caps, capId);
    if (val !== null) this.ctx.setCapability('target_temperature', parseFloat(val));
  }

  _readMode(caps) {
    // Try heating mode first, then on/off
    const modeCap = this._capMap.heating_mode;
    const onOffCap = this._capMap.on_off;

    if (modeCap !== undefined) {
      const val = this.ctx.getCapValue(caps, modeCap);
      if (val !== null) {
        const modeInt = parseInt(val, 10);
        const modeMap = { 0: 'off', 1: 'manual', 3: 'eco_plus', 4: 'prog' };
        const modeStr = modeMap[modeInt] || 'manual';
        this.ctx.setCapability('cozytouch_heating_mode', modeStr);
        this.ctx.setCapability('onoff', modeStr !== 'off');
        return;
      }
    }

    if (onOffCap !== undefined) {
      const val = this.ctx.getCapValue(caps, onOffCap);
      if (val !== null) {
        const isOn = val === '1' || val === 1 || val === true;
        this.ctx.setCapability('onoff', isOn);
        this.ctx.setCapability('cozytouch_heating_mode', isOn ? 'manual' : 'off');
      }
    }
  }

  _readTempBounds(caps) {
    const minCap = this._capMap.min_temp;
    const maxCap = this._capMap.max_temp;
    if (minCap === undefined || maxCap === undefined) return;
    const minVal = this.ctx.getCapValue(caps, minCap);
    const maxVal = this.ctx.getCapValue(caps, maxCap);
    if (minVal !== null && maxVal !== null) {
      this.ctx.setCapabilityOptions('target_temperature', {
        min: parseFloat(minVal), max: parseFloat(maxVal),
      });
    }
  }

}

module.exports = TowelRackCozytouchHandler;
