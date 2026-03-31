'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');

class ClimateDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    const api = new CozyTouchAPI({});
    return allDevices.filter((dev) => {
      const type = api.getDeviceType(dev.modelId);
      return type === 'HEAT_PUMP' || type === 'AC';
    });
  }

  _mapDevice(cozytouchDevice, username, password) {
    const base = super._mapDevice(cozytouchDevice, username, password);

    // Determine available capabilities based on model
    const api = new CozyTouchAPI({});
    const type = api.getDeviceType(cozytouchDevice.modelId);
    const hvacModes = api.getHvacModes(cozytouchDevice.modelId);

    const capabilities = [
      'target_temperature',
      'measure_temperature',
      'cozytouch_hvac_mode',
      'onoff',
    ];

    // AC models support fan and swing
    if (type === 'AC') {
      capabilities.push('cozytouch_fan_mode');
      capabilities.push('cozytouch_swing_mode');
    }

    base.capabilities = capabilities;

    // Store HVAC modes and type for device-level use
    base.store.hvacModes = hvacModes;
    base.store.deviceType = type;

    return base;
  }

}

module.exports = ClimateDriver;
