'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');
const OverkizAPI = require('../../lib/OverkizAPI');

class WaterHeaterDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol === 'overkiz') {
        const overkizApi = new OverkizAPI({});
        return overkizApi.getDeviceType(dev) === 'WATER_HEATER';
      }
      const cozyApi = new CozyTouchAPI({});
      return cozyApi.getDeviceType(dev.modelId) === 'WATER_HEATER';
    });
  }

  _mapCozyTouchDevice(dev, username, password) {
    const base = super._mapCozyTouchDevice(dev, username, password);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'cozytouch_away_mode', 'onoff'];
    return base;
  }

  _mapOverkizDevice(dev, username, password) {
    const base = super._mapOverkizDevice(dev, username, password);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'cozytouch_away_mode', 'onoff'];
    return base;
  }

}

module.exports = WaterHeaterDriver;
