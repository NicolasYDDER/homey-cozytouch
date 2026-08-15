'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
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
          values: [
            { id: 'off', title: { en: 'Off', fr: 'Arrêt' } },
            { id: 'heat', title: { en: 'Heat', fr: 'Chauffage' } },
            { id: 'cool', title: { en: 'Cool', fr: 'Rafraîchissement' } },
            { id: 'dry', title: { en: 'Dry', fr: 'Déshumidification' } },
            { id: 'auto', title: { en: 'Auto', fr: 'Automatique' } },
          ],
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
      'onoff',
    ];
    base.capabilitiesOptions = {
      target_temperature: {
        min: 16,
        max: 30,
        step: 0.5,
      },
      cozytouch_heating_mode: {
        values: [
          { id: 'off', title: { en: 'Off', fr: 'Arrêt' } },
          { id: 'manual', title: { en: 'Manual', fr: 'Manuel' } },
          { id: 'prog', title: { en: 'Program', fr: 'Programme' } },
        ],
      },
    };
    return base;
  }

}

module.exports = ZoneControlDriver;
