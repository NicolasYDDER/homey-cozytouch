'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');
const OverkizAPI = require('../../lib/OverkizAPI');
const {
  isZoneControlDevice,
  isPassApcHeatPumpDevice,
} = require('../../lib/helpers/overkiz-device');
const { climateCapIds } = require('../../lib/constants/cozytouch-mappings');
const {
  mappedCapabilityIds,
  reportsMappedCapability,
} = require('../../lib/helpers/capability-support');

class ClimateDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol === 'overkiz') {
        // Shogun Zone Control and Pass APC heat pumps have their own drivers
        if (isZoneControlDevice(dev) || isPassApcHeatPumpDevice(dev)) return false;
        const overkizApi = new OverkizAPI({});
        return overkizApi.getDeviceType(dev) === 'CLIMATE';
      }
      const cozyApi = new CozyTouchAPI({});
      const type = cozyApi.getDeviceType(dev.modelId);
      if (type !== 'HEAT_PUMP' && type !== 'AC') return false;
      return reportsMappedCapability(dev, mappedCapabilityIds(climateCapIds(dev.productId)));
    });
  }

  _mapCozyTouchDevice(dev) {
    const base = super._mapCozyTouchDevice(dev);
    const cozyApi = new CozyTouchAPI({});
    const type = cozyApi.getDeviceType(dev.modelId);
    const hvacModes = cozyApi.getHvacModes(dev.modelId);

    const capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_hvac_mode', 'onoff'];
    // Only where the product answers on them. The AC range holds real air
    // conditioners *and* the heating zones of an Alféa heat pump, and a zone has
    // no fan and no louvre: its block sets both to null.
    const caps = climateCapIds(dev.productId);
    if (type === 'AC' && caps.FAN_MODE) {
      capabilities.push('cozytouch_fan_mode');
    }
    if (type === 'AC' && caps.SWING_MODE) {
      capabilities.push('cozytouch_swing_mode');
    }

    base.capabilities = capabilities;
    base.store.hvacModes = hvacModes;
    base.store.deviceType = type;
    return base;
  }

  _mapOverkizDevice(dev) {
    const base = super._mapOverkizDevice(dev);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_hvac_mode', 'onoff'];
    return base;
  }

}

module.exports = ClimateDriver;
