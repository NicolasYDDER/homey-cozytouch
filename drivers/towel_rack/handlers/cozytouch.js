'use strict';

/**
 * CozyTouch handler for towel racks (Kelud, Asama via Magellan).
 *
 * The CozyTouch API returns NO metadata (name/type/category) for these devices,
 * only raw capabilityId + value. IDs are mapped from value analysis:
 *
 *   [40]  = target/comfort temperature (e.g. 21.0)
 *   [117] = current room temperature (e.g. 15.11)
 *   [160] = min temperature bound (e.g. 7.0)
 *   [161] = max temperature bound (e.g. 28.0)
 *   [164] = operating mode: 0=standby, 1=basic/manual, 2=internal prog
 *   [172] = eco temperature setpoint
 *   [7]   = derogation/override flag
 */

const CAP = {
  TARGET_TEMP: 40,
  CURRENT_TEMP: 117,
  MODE: 164,
  DEROGATION: 7,
  ECO_TEMP: 172,
  MIN_TEMP: 160,
  MAX_TEMP: 161,
};

// Mode values for cap 164
const MODE_TO_API = { off: '0', manual: '1', prog: '2' };
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
    // On = manual mode (1), Off = standby mode (0)
    await this.ctx.setCapValue(CAP.MODE, value ? '1' : '0');
    this.ctx.setCapability('cozytouch_heating_mode', value ? 'manual' : 'off');
  }

  async setMode(mode) {
    const apiValue = MODE_TO_API[mode];
    if (apiValue !== undefined) {
      await this.ctx.setCapValue(CAP.MODE, apiValue);
    } else {
      // eco_plus not directly available, use manual as fallback
      this.ctx.log(`Mode "${mode}" not supported, falling back to manual`);
      await this.ctx.setCapValue(CAP.MODE, '1');
    }
    this.ctx.setCapability('cozytouch_heating_mode', mode);
    this.ctx.setCapability('onoff', mode !== 'off');
  }

  async updateState() {
    const caps = await this.ctx.getCapabilities();

    // Log raw capabilities once for debugging
    if (!this._logged) {
      this._logged = true;
      this.ctx.log('Kelud capabilities (raw):', caps.map(
        (c) => `[${c.capabilityId}]=${c.value}`,
      ).join(', '));
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

    // Operating mode → on/off + heating mode
    const mode = this.ctx.getCapValue(caps, CAP.MODE);
    if (mode !== null) {
      const modeInt = parseInt(mode, 10);
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
