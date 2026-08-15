'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const { isPassCozytouch } = require('../../lib/helpers/overkiz-device');

class PassCozytouchDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    return allDevices.filter((dev) => {
      if (dev._protocol !== 'overkiz') return false;
      return isPassCozytouch(dev);
    });
  }

  _mapOverkizDevice(dev, username, password) {
    const base = super._mapOverkizDevice(dev, username, password);
    base.capabilities = ['cozytouch_pass_level', 'onoff'];
    return base;
  }

}

module.exports = PassCozytouchDriver;
