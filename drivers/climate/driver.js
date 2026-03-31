'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');
const OverkizAPI = require('../../lib/OverkizAPI');

class ClimateDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol === 'overkiz') {
        const overkizApi = new OverkizAPI({});
        return overkizApi.getDeviceType(dev) === 'CLIMATE';
      }
      const cozyApi = new CozyTouchAPI({});
      const type = cozyApi.getDeviceType(dev.modelId);
      return type === 'HEAT_PUMP' || type === 'AC';
    });
  }

  _mapCozyTouchDevice(dev, username, password) {
    const base = super._mapCozyTouchDevice(dev, username, password);
    const cozyApi = new CozyTouchAPI({});
    const type = cozyApi.getDeviceType(dev.modelId);
    const hvacModes = cozyApi.getHvacModes(dev.modelId);

    const capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_hvac_mode', 'onoff'];
    if (type === 'AC') {
      capabilities.push('cozytouch_fan_mode');
      capabilities.push('cozytouch_swing_mode');
    }

    base.capabilities = capabilities;
    base.store.hvacModes = hvacModes;
    base.store.deviceType = type;
    return base;
  }

  _mapOverkizDevice(dev, username, password) {
    const base = super._mapOverkizDevice(dev, username, password);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_hvac_mode', 'onoff'];
    return base;
  }

}

module.exports = ClimateDriver;
