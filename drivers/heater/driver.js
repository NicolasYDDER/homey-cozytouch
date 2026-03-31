'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');
const OverkizAPI = require('../../lib/OverkizAPI');

class HeaterDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol === 'overkiz') {
        const overkizApi = new OverkizAPI({});
        const type = overkizApi.getDeviceType(dev);
        return type === 'HEATER' || type === 'TOWEL_RACK' || type === 'THERMOSTAT';
      }
      const cozyApi = new CozyTouchAPI({});
      const type = cozyApi.getDeviceType(dev.modelId);
      return type === 'GAZ_BOILER' || type === 'TOWEL_RACK' || type === 'THERMOSTAT';
    });
  }

  _mapCozyTouchDevice(dev, username, password) {
    const base = super._mapCozyTouchDevice(dev, username, password);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'onoff'];
    return base;
  }

  _mapOverkizDevice(dev, username, password) {
    const base = super._mapOverkizDevice(dev, username, password);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'onoff'];
    return base;
  }

}

module.exports = HeaterDriver;
