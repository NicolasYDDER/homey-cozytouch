'use strict';

const CozyTouchAPI = require('../../../lib/CozyTouchAPI');
const {
  climateCapIds,
  FAN_MODE_TO_API, API_TO_FAN_MODE,
  SWING_MODE_TO_API, API_TO_SWING_MODE,
} = require('../../../lib/constants/cozytouch-mappings');

class ClimateCozytouchHandler {

  constructor(ctx, hvacModes, _deviceType) {
    this.ctx = ctx;
    this.caps = climateCapIds(((ctx && ctx.store) || {}).productId);
    this._hvacModes = hvacModes || CozyTouchAPI.HVAC_MODES.default;
    this._currentHvacMode = 'off';

    // Build reverse map: mode string -> API int
    this._hvacModeToApi = {};
    for (const [apiVal, modeStr] of Object.entries(this._hvacModes)) {
      this._hvacModeToApi[modeStr] = parseInt(apiVal, 10);
    }
  }

  async setTargetTemperature(value) {
    const capId = (this._currentHvacMode === 'cool' || this._currentHvacMode === 'dry')
      ? this.caps.TARGET_TEMP_COOL : this.caps.TARGET_TEMP_HEAT;
    await this.ctx.setCapValue(capId, value);
  }

  async setOnOff(value) {
    if (!value) {
      await this.ctx.setCapValue(this.caps.HVAC_MODE, '0');
      this.ctx.setCapability('cozytouch_hvac_mode', 'off');
    } else {
      const mode = this._currentHvacMode !== 'off' ? this._currentHvacMode : 'heat';
      const apiVal = this._hvacModeToApi[mode];
      if (apiVal !== undefined) {
        await this.ctx.setCapValue(this.caps.HVAC_MODE, String(apiVal));
        this.ctx.setCapability('cozytouch_hvac_mode', mode);
      }
    }
  }

  async setMode(mode) {
    const apiVal = this._hvacModeToApi[mode];
    if (apiVal !== undefined) {
      await this.ctx.setCapValue(this.caps.HVAC_MODE, String(apiVal));
      this._currentHvacMode = mode;
      this.ctx.setCapability('cozytouch_hvac_mode', mode);
      this.ctx.setCapability('onoff', mode !== 'off');
    }
  }

  async setFanMode(value) {
    const apiVal = FAN_MODE_TO_API[value];
    if (apiVal !== undefined) {
      await this.ctx.setCapValue(this.caps.FAN_MODE, apiVal);
    }
  }

  async setSwingMode(value) {
    const apiVal = SWING_MODE_TO_API[value];
    if (apiVal !== undefined) {
      await this.ctx.setCapValue(this.caps.SWING_MODE, apiVal);
    }
  }

  async updateState() {
    const caps = await this.ctx.getCapabilities();

    const currentTemp = this.ctx.getCapValue(caps, this.caps.CURRENT_TEMP);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const hvacMode = this.ctx.getCapValue(caps, this.caps.HVAC_MODE);
    if (hvacMode !== null) {
      const modeStr = this._hvacModes[parseInt(hvacMode, 10)];
      if (modeStr) {
        this._currentHvacMode = modeStr;
        this.ctx.setCapability('cozytouch_hvac_mode', modeStr);
        this.ctx.setCapability('onoff', modeStr !== 'off');
      }
    }

    const isCooling = this._currentHvacMode === 'cool' || this._currentHvacMode === 'dry';
    const targetTemp = this.ctx.getCapValue(caps, isCooling ? this.caps.TARGET_TEMP_COOL : this.caps.TARGET_TEMP_HEAT);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    if (this.ctx.hasCapability('cozytouch_fan_mode')) {
      const fanMode = this.ctx.getCapValue(caps, this.caps.FAN_MODE);
      if (fanMode !== null) {
        const fanStr = API_TO_FAN_MODE[parseInt(fanMode, 10)];
        if (fanStr) this.ctx.setCapability('cozytouch_fan_mode', fanStr);
      }
    }

    if (this.ctx.hasCapability('cozytouch_swing_mode')) {
      const swingMode = this.ctx.getCapValue(caps, this.caps.SWING_MODE);
      if (swingMode !== null) {
        const swingStr = API_TO_SWING_MODE[parseInt(swingMode, 10)];
        if (swingStr) this.ctx.setCapability('cozytouch_swing_mode', swingStr);
      }
    }

    const minCapId = isCooling ? this.caps.MIN_TEMP_COOL : this.caps.MIN_TEMP_HEAT;
    const maxCapId = isCooling ? this.caps.MAX_TEMP_COOL : this.caps.MAX_TEMP_HEAT;
    const minTemp = this.ctx.getCapValue(caps, minCapId);
    const maxTemp = this.ctx.getCapValue(caps, maxCapId);
    if (minTemp !== null && maxTemp !== null) {
      this.ctx.setCapabilityOptions('target_temperature', {
        min: parseFloat(minTemp), max: parseFloat(maxTemp),
      });
    }
  }

}

module.exports = ClimateCozytouchHandler;
