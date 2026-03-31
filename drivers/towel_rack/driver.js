'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const OverkizAPI = require('../../lib/OverkizAPI');

class TowelRackDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    // Towel racks are only controllable via Overkiz.
    // The Magellan API has read-only mirrors that don't accept commands.
    return allDevices.filter((dev) => {
      if (dev._protocol !== 'overkiz') return false;
      const overkizApi = new OverkizAPI({});
      const type = overkizApi.getDeviceType(dev);
      return type === 'TOWEL_RACK' || type === 'HEATER';
    });
  }

  _mapOverkizDevice(dev, username, password) {
    const base = super._mapOverkizDevice(dev, username, password);
    base.capabilities = ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'onoff'];
    return base;
  }

}

module.exports = TowelRackDriver;
