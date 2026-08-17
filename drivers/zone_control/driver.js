'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const {
  ZONE_CONTROL_HVAC_MODE_VALUES,
  ZONE_CONTROL_ZONE_HEATING_MODE_OPTIONS,
} = require('./constants');
const {
  isZoneControlMain,
  isZoneControlHeatingAndCoolingZone,
  isZoneControlZoneTemperatureSensor,
  getZoneControlMainDeviceURL,
  getZoneControlZoneTemperatureSensorUrl,
} = require('../../lib/helpers/overkiz-device');

/**
 * Atlantic Shogun Zone Control (Pass APC Zone Control stack).
 * Pairs the global controller + heating/cooling zones (not temperature sensors).
 */
class ZoneControlDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol !== 'overkiz') return false;
      if (isZoneControlZoneTemperatureSensor(dev)) return false;
      return isZoneControlMain(dev) || isZoneControlHeatingAndCoolingZone(dev);
    });
  }

  _mapOverkizDevice(dev, username, password) {
    const base = super._mapOverkizDevice(dev, username, password);

    if (isZoneControlMain(dev)) {
      base.store.zoneControlRole = 'controller';
      base.capabilities = ['cozytouch_hvac_mode', 'onoff'];
      base.capabilitiesOptions = {
        cozytouch_hvac_mode: {
          values: ZONE_CONTROL_HVAC_MODE_VALUES,
        },
      };
      return base;
    }

    // Heating/cooling zone
    base.store.zoneControlRole = 'zone';
    base.store.zoneControlMainDeviceURL = getZoneControlMainDeviceURL(dev.deviceURL);
    base.store.zoneControlTemperatureSensorURL = getZoneControlZoneTemperatureSensorUrl(dev.deviceURL);
    base.capabilities = [
      'target_temperature',
      'measure_temperature',
      'cozytouch_heating_mode',
      'thermostat_mode',
      'onoff',
    ];
    base.capabilitiesOptions = {
      target_temperature: {
        min: 16,
        max: 30,
        step: 0.5,
      },
      // thermostat_mode: Homey native defaults (tile colors; read-only via listener)
      cozytouch_heating_mode: ZONE_CONTROL_ZONE_HEATING_MODE_OPTIONS,
    };
    return base;
  }

}

module.exports = ZoneControlDriver;
