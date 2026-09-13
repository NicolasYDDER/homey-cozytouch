'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const CozyTouchAPI = require('../../lib/CozyTouchAPI');
const OverkizAPI = require('../../lib/OverkizAPI');
const {
  isPassCozytouch,
  isZoneControlDevice,
  isAdjustableSetpointElectricalHeater,
  isPassApcHeatPumpDevice,
} = require('../../lib/helpers/overkiz-device');

class HeaterDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol === 'overkiz') {
        // Pass APC heat pump units and circuits share uiClass HeatingSystem with
        // plain heaters, but speak the Pass APC protocol and have their own driver.
        if (isPassCozytouch(dev) || isZoneControlDevice(dev) || isPassApcHeatPumpDevice(dev)) {
          return false;
        }
        const overkizApi = new OverkizAPI({});
        const type = overkizApi.getDeviceType(dev);
        return type === 'HEATER' || type === 'THERMOSTAT';
      }
      const cozyApi = new CozyTouchAPI({});
      const type = cozyApi.getDeviceType(dev.modelId);
      return type === 'GAZ_BOILER' || type === 'THERMOSTAT';
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

    if (isAdjustableSetpointElectricalHeater(dev)) {
      base.capabilitiesOptions = {
        cozytouch_heating_mode: {
          values: [
            { id: 'off', title: { en: 'Off', fr: 'Arrêt' } },
            { id: 'manual', title: { en: 'Manual', fr: 'Manuel' } },
            { id: 'prog', title: { en: 'Program', fr: 'Programme' } },
          ],
        },
      };
    }

    return base;
  }

}

module.exports = HeaterDriver;
