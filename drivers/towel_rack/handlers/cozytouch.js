'use strict';

/**
 * CozyTouch handler for towel racks (Kelud, Asama via Magellan).
 *
 * Capability mapping from setup analysis + reference project:
 *   [7]   = system operating mode (enum): 0=standby, 1=basic, 2=internal
 *   [40]  = target/comfort temperature (writable)
 *   [117] = current room temperature (read-only)
 *   [153] = heating element active (binary, read-only)
 *   [160] = min temperature bound
 *   [161] = max temperature bound
 *   [164] = current mode status (read-only)
 *   [165] = boost mode (switch: 0=off, 1=on)
 *   [172] = eco temperature setpoint
 *   [184] = program mode switch (0=manual, 1=program)
 *
 * Mode control uses COMBINATION of cap 7 + cap 184:
 *   OFF:    cap 7 = '0' (standby)
 *   MANUAL: cap 7 = '1' (basic) + cap 184 = '0' (prog off)
 *   PROG:   cap 7 = '2' (internal) + cap 184 = '1' (prog on)
 */

const CAP = {
  SYS_MODE: 7,          // System operating mode enum (writable)
  TARGET_TEMP: 40,       // Comfort target temperature (writable)
  CURRENT_TEMP: 117,     // Current measured temp (read-only)
  RESISTANCE: 153,       // Heating element status (read-only)
  MIN_TEMP: 160,
  MAX_TEMP: 161,
  MODE_STATUS: 164,      // Current mode readback (read-only)
  BOOST: 165,            // Boost mode switch (writable)
  ECO_TEMP: 172,         // Eco temperature
  PROG_MODE: 184,        // Program mode switch (writable)
};

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
    if (value) {
      // Turn on: set to basic mode + manual
      await this.ctx.setCapValue(CAP.SYS_MODE, '1');
      await this.ctx.setCapValue(CAP.PROG_MODE, '0');
      this.ctx.setCapability('cozytouch_heating_mode', 'manual');
    } else {
      // Turn off: set to standby
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
        // No native eco mode; use manual as fallback
        this.ctx.log('eco_plus not available, using manual');
        await this.ctx.setCapValue(CAP.SYS_MODE, '1');
        await this.ctx.setCapValue(CAP.PROG_MODE, '0');
        mode = 'manual';
        break;
      default:
        this.ctx.log(`Unknown mode "${mode}", ignoring`);
        return;
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const caps = await this.ctx.getCapabilities();

    if (!this._logged) {
      this._logged = true;
      const debugIds = [7, 40, 117, 153, 164, 165, 172, 184];
      this.ctx.log('Key capabilities:',
        caps.filter((c) => debugIds.includes(c.capabilityId))
          .map((c) => `[${c.capabilityId}]=${c.value}`)
          .join(', '),
      );
    }

    // Current temperature
    const currentTemp = this.ctx.getCapValue(caps, CAP.CURRENT_TEMP);
    if (currentTemp !== null) {
      this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));
    }

    // Target temperature
    const targetTemp = this.ctx.getCapValue(caps, CAP.TARGET_TEMP);
    if (targetTemp !== null) {
      this.ctx.setCapability('target_temperature', parseFloat(targetTemp));
    }

    // Mode: read from cap 164 (status readback)
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
