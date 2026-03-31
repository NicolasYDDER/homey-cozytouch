'use strict';

/**
 * CozyTouch handler for towel racks (Kelud, Asama via Magellan).
 *
 * Capability IDs mapped from device analysis:
 *   [7]   = mode CONTROL (writable): 0=standby, 1=basic/manual, 2=prog
 *   [40]  = target/comfort temperature (writable)
 *   [117] = current room temperature (read-only)
 *   [160] = min temperature bound (read-only)
 *   [161] = max temperature bound (read-only)
 *   [164] = mode STATUS (read-only readback)
 *   [172] = eco temperature setpoint
 */

const CAP = {
  MODE_CONTROL: 7,      // Writable mode
  TARGET_TEMP: 40,      // Writable comfort setpoint
  CURRENT_TEMP: 117,    // Read-only measured temp
  MIN_TEMP: 160,        // Read-only min bound
  MAX_TEMP: 161,        // Read-only max bound
  MODE_STATUS: 164,     // Read-only mode readback
  ECO_TEMP: 172,        // Eco setpoint
};

// Writing cap 7: ENUM SystemOperatingMode as integer index string
const MODE_TO_API = { off: '0', manual: '1', prog: '2' };

// Reading cap 164: returns numeric status
const API_TO_MODE = { 0: 'off', 1: 'manual', 2: 'prog' };

class TowelRackCozytouchHandler {

  constructor(ctx) {
    this.ctx = ctx;
    this._logged = false;
  }

  async setTargetTemperature(value) {
    await this.ctx.setCapValue(CAP.TARGET_TEMP, value);
  }

  async setOnOff(value) {
    // On = 1 (basic/manual), Off = 0 (standby)
    await this.ctx.setCapValue(CAP.MODE_CONTROL, value ? '1' : '0');
    this.ctx.setCapability('cozytouch_heating_mode', value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const apiValue = MODE_TO_API[mode];
    if (apiValue !== undefined) {
      await this.ctx.setCapValue(CAP.MODE_CONTROL, apiValue);
    } else {
      // eco_plus not natively available, use manual as fallback
      this.ctx.log(`Mode "${mode}" not directly supported, using 1 (basic)`);
      await this.ctx.setCapValue(CAP.MODE_CONTROL, '1');
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode !== 'eco_plus' ? mode : 'manual');
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const caps = await this.ctx.getCapabilities();

    if (!this._logged) {
      this._logged = true;
      // Log full objects for key capabilities to see all metadata
      const debugIds = [7, 40, 117, 152, 157, 159, 164, 172];
      for (const cap of caps) {
        if (debugIds.includes(cap.capabilityId)) {
          this.ctx.log(`Cap [${cap.capabilityId}] FULL:`, JSON.stringify(cap));
        }
      }
    }

    // Current temperature (read-only)
    const currentTemp = this.ctx.getCapValue(caps, CAP.CURRENT_TEMP);
    if (currentTemp !== null) {
      this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));
    }

    // Target temperature
    const targetTemp = this.ctx.getCapValue(caps, CAP.TARGET_TEMP);
    if (targetTemp !== null) {
      this.ctx.setCapability('target_temperature', parseFloat(targetTemp));
    }

    // Mode status (read from cap 164, the read-only readback)
    const modeStatus = this.ctx.getCapValue(caps, CAP.MODE_STATUS);
    if (modeStatus !== null) {
      const modeInt = parseInt(modeStatus, 10);
      const modeStr = API_TO_MODE[modeInt] || 'off';
      this.ctx.setCapability('cozytouch_heating_mode', modeStr);
      this.ctx.setCapability('onoff', modeStr !== 'off');
    }

    // Temperature bounds
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
