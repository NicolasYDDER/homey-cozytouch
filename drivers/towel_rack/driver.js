'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');
const OverkizAPI = require('../../lib/OverkizAPI');
const { isFilPiloteElectricalHeater } = require('../../lib/helpers/overkiz-device');

const FIL_PILOTE_CAPABILITIES = ['cozytouch_heating_mode', 'onoff'];
const DEFAULT_CAPABILITIES = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'onoff'];

class TowelRackDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol === 'overkiz') {
        if (isFilPiloteElectricalHeater(dev)) return true;
        const overkizApi = new OverkizAPI({});
        const type = overkizApi.getDeviceType(dev);
        return type === 'TOWEL_RACK' || type === 'HEATER';
      }
      const cozyApi = new CozyTouchAPI({});
      const type = cozyApi.getDeviceType(dev.modelId);
      return type === 'TOWEL_RACK';
    });
  }

  _mapCozyTouchDevice(dev, username, password) {
    const base = super._mapCozyTouchDevice(dev, username, password);
    base.capabilities = DEFAULT_CAPABILITIES;
    return base;
  }

  _mapOverkizDevice(dev, username, password) {
    const base = super._mapOverkizDevice(dev, username, password);
    base.capabilities = isFilPiloteElectricalHeater(dev)
      ? FIL_PILOTE_CAPABILITIES
      : DEFAULT_CAPABILITIES;
    return base;
  }

}

module.exports = TowelRackDriver;
