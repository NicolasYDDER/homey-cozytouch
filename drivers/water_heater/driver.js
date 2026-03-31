'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');

class WaterHeaterDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    const api = new CozyTouchAPI({});
    return allDevices.filter((dev) => {
      const type = api.getDeviceType(dev.modelId);
      return type === 'WATER_HEATER';
    });
  }

  _mapDevice(cozytouchDevice, username, password) {
    const base = super._mapDevice(cozytouchDevice, username, password);
    base.capabilities = [
      'target_temperature',
      'measure_temperature',
      'cozytouch_heating_mode',
      'cozytouch_away_mode',
      'onoff',
    ];
    return base;
  }

}

module.exports = WaterHeaterDriver;
