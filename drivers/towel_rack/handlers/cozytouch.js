'use strict';

/**
 * CozyTouch handler for towel racks (Kelud, Asama via Magellan).
 *
 * Uses a spy mode: watches ALL capabilities for changes between polls
 * to discover which IDs actually control the device.
 */

// Best-guess mapping (to be refined once spy mode reveals the real IDs)
const CAP = {
  SYS_MODE: 7,
  TARGET_TEMP: 40,
  CURRENT_TEMP: 117,
  MIN_TEMP: 160,
  MAX_TEMP: 161,
  MODE_STATUS: 164,
  BOOST: 165,
  ECO_TEMP: 172,
  PROG_MODE: 184,
};

const API_TO_MODE = { 0: 'off', 1: 'manual', 2: 'prog' };

class TowelRackCozytouchHandler {

  constructor(ctx) {
    this.ctx = ctx;
    this._previousValues = {};  // Spy mode: track all values
    this._pollCount = 0;
  }

  async setTargetTemperature(value) {
    await this.ctx.setCapValue(CAP.TARGET_TEMP, value);
  }

  async setOnOff(value) {
    if (value) {
      await this.ctx.setCapValue(CAP.SYS_MODE, '1');
      await this.ctx.setCapValue(CAP.PROG_MODE, '0');
      this.ctx.setCapability('cozytouch_heating_mode', 'manual');
    } else {
      await this.ctx.setCapValue(CAP.SYS_MODE, '0');
      this.ctx.setCapability('cozytouch_heating_mode', 'off');
    }
  }

  async setMode(mode) {
    switch (mode) {
      case 'off':
        await this.ctx.setCapValue(CAP.SYS_MODE, '0');
        break;
      case 'manual':
        await this.ctx.setCapValue(CAP.SYS_MODE, '1');
        await this.ctx.setCapValue(CAP.PROG_MODE, '0');
        break;
      case 'prog':
        await this.ctx.setCapValue(CAP.SYS_MODE, '2');
        await this.ctx.setCapValue(CAP.PROG_MODE, '1');
        break;
      case 'eco_plus':
        this.ctx.log('eco_plus not available, using manual');
        await this.ctx.setCapValue(CAP.SYS_MODE, '1');
        await this.ctx.setCapValue(CAP.PROG_MODE, '0');
        mode = 'manual';
        break;
      default:
        return;
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const caps = await this.ctx.getCapabilities();
    this._pollCount++;

    // ── SPY MODE: detect changes across ALL capabilities ──────
    const currentValues = {};
    for (const cap of caps) {
      currentValues[cap.capabilityId] = String(cap.value);
    }

    if (this._pollCount === 1) {
      // First poll: snapshot all values
      this.ctx.log('=== SPY MODE ACTIVE: Change mode via Cozytouch app to reveal capability IDs ===');
      this.ctx.log(`Tracking ${Object.keys(currentValues).length} capabilities`);
    }

    // Compare with previous values and log ANY changes
    if (Object.keys(this._previousValues).length > 0) {
      for (const [id, value] of Object.entries(currentValues)) {
        const prev = this._previousValues[id];
        if (prev !== undefined && prev !== value) {
          this.ctx.log(`>>> CHANGED: Cap [${id}] ${prev} → ${value}`);
        }
      }
    }

    this._previousValues = currentValues;

    // ── Normal state updates ──────────────────────────────────
    const currentTemp = this.ctx.getCapValue(caps, CAP.CURRENT_TEMP);
    if (currentTemp !== null) {
      this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));
    }

    const targetTemp = this.ctx.getCapValue(caps, CAP.TARGET_TEMP);
    if (targetTemp !== null) {
      this.ctx.setCapability('target_temperature', parseFloat(targetTemp));
    }

    const modeStatus = this.ctx.getCapValue(caps, CAP.MODE_STATUS);
    if (modeStatus !== null) {
      const modeInt = parseInt(modeStatus, 10);
      const modeStr = API_TO_MODE[modeInt] || 'off';
      this.ctx.setCapability('cozytouch_heating_mode', modeStr);
      this.ctx.setCapability('onoff', modeStr !== 'off');
    }

    const minTemp = this.ctx.getCapValue(caps, CAP.MIN_TEMP);
    const maxTemp = this.ctx.getCapValue(caps, CAP.MAX_TEMP);
    if (minTemp !== null && maxTemp !== null) {
      this.ctx.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp),
        max: parseFloat(maxTemp),
      });
    }
  }

}

module.exports = TowelRackCozytouchHandler;
