'use strict';

/**
 * CozyTouch handler for towel racks (Kelud, Asama via Magellan).
 *
 * Cap 7 is the HVAC mode: 0=off, 4=heat (same as other Atlantic HVAC devices).
 * Cap 184 selects the preset within heat mode: 0=manual, 1=prog.
 * The Cozytouch app uses this same pattern.
 */

const CAP = {
  HVAC_MODE: 7,        // Write: 0=off, 4=heat
  TARGET_TEMP: 40,     // Write: numeric temperature
  CURRENT_TEMP: 117,   // Read: current room temperature
  MIN_TEMP: 160,       // Read: min setpoint
  MAX_TEMP: 161,       // Read: max setpoint
  MODE_STATUS: 164,    // Read: 0=off, 1=manual, 2=prog
  BOOST: 165,
  ECO_TEMP: 172,
  PROG_MODE: 184,      // Write: 0=manual, 1=prog
};

const API_TO_MODE = { 0: 'off', 1: 'manual', 2: 'prog' };

class TowelRackCozytouchHandler {

  constructor(ctx) {
    this.ctx = ctx;
  }

  async setTargetTemperature(value) {
    await this.ctx.setCapValue(CAP.TARGET_TEMP, value);
  }

  async setOnOff(value) {
    if (value) {
      await this.ctx.setCapValue(CAP.HVAC_MODE, '4');
      await this.ctx.setCapValue(CAP.PROG_MODE, '0');
      this.ctx.setCapability('cozytouch_heating_mode', 'manual');
    } else {
      await this.ctx.setCapValue(CAP.HVAC_MODE, '0');
      this.ctx.setCapability('cozytouch_heating_mode', 'off');
    }
  }

  async setMode(mode) {
    switch (mode) {
      case 'off':
        await this.ctx.setCapValue(CAP.HVAC_MODE, '0');
        break;
      case 'manual':
        await this.ctx.setCapValue(CAP.HVAC_MODE, '4');
        await this.ctx.setCapValue(CAP.PROG_MODE, '0');
        break;
      case 'prog':
        await this.ctx.setCapValue(CAP.HVAC_MODE, '4');
        await this.ctx.setCapValue(CAP.PROG_MODE, '1');
        break;
      case 'eco_plus':
        this.ctx.log('eco_plus not available for towel rack, using manual');
        await this.ctx.setCapValue(CAP.HVAC_MODE, '4');
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
