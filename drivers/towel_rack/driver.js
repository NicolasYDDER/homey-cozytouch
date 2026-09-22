'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');
const OverkizAPI = require('../../lib/OverkizAPI');
const {
  isPassCozytouch,
  isAdjustableSetpointElectricalHeater,
  isZoneControlDevice,
  isPassApcHeatPumpDevice,
} = require('../../lib/helpers/overkiz-device');
const { TOWEL_RACK_CAP_IDS } = require('../../lib/constants/cozytouch-mappings');
const {
  mappedCapabilityIds,
  reportsMappedCapability,
} = require('../../lib/helpers/capability-support');

class TowelRackDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol === 'overkiz') {
        if (
          isPassCozytouch(dev)
          || isAdjustableSetpointElectricalHeater(dev)
          || isZoneControlDevice(dev)
          || isPassApcHeatPumpDevice(dev)
        ) {
          return false;
        }
        const overkizApi = new OverkizAPI({});
        const type = overkizApi.getDeviceType(dev);
        return type === 'TOWEL_RACK' || type === 'HEATER';
      }
      const cozyApi = new CozyTouchAPI({});
      if (cozyApi.getDeviceType(dev.modelId) !== 'TOWEL_RACK') return false;
      return reportsMappedCapability(dev, mappedCapabilityIds(TOWEL_RACK_CAP_IDS));
    });
  }

  _mapCozyTouchDevice(dev) {
    const base = super._mapCozyTouchDevice(dev);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'onoff'];
    return base;
  }

  _mapOverkizDevice(dev) {
    const base = super._mapOverkizDevice(dev);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'onoff'];
    return base;
  }

}

module.exports = TowelRackDriver;
