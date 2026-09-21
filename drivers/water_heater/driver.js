'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');
const OverkizAPI = require('../../lib/OverkizAPI');
const { waterHeaterCapIds } = require('../../lib/constants/cozytouch-mappings');
const {
  mappedCapabilityIds,
  reportsMappedCapability,
} = require('../../lib/helpers/capability-support');

class WaterHeaterDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol === 'overkiz') {
        const overkizApi = new OverkizAPI({});
        return overkizApi.getDeviceType(dev) === 'WATER_HEATER';
      }
      const cozyApi = new CozyTouchAPI({});
      if (cozyApi.getDeviceType(dev.modelId) !== 'WATER_HEATER') return false;
      return reportsMappedCapability(dev, mappedCapabilityIds(waterHeaterCapIds(dev.productId)));
    });
  }

  _mapCozyTouchDevice(dev) {
    const base = super._mapCozyTouchDevice(dev);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode'];
    // Away is per product. On the Alféa Extensa tank (productId 47) it is a
    // start/stop timestamp pair rather than a switch, so the block leaves it
    // unmapped — offered anyway, the toggle answered «This Cozytouch water
    // heater has no away capability» every time it was touched.
    if (waterHeaterCapIds(dev.productId).AWAY_MODE) {
      base.capabilities.push('cozytouch_away_mode');
    }
    return base;
  }

  _mapOverkizDevice(dev) {
    const base = super._mapOverkizDevice(dev);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'cozytouch_away_mode'];
    return base;
  }

}

module.exports = WaterHeaterDriver;
