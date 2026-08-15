'use strict';

const CozyTouchDevice = require('../../lib/CozyTouchDevice');
const PassCozytouchOverkizHandler = require('./handlers/overkiz');

class PassCozytouchDevice extends CozyTouchDevice {

  _createHandler(store, data) {
    const ctx = this._buildHandlerContext(store, data);
    if (this._protocol !== 'overkiz') {
      throw new Error('Pass Cozytouch driver only supports Overkiz devices');
    }
    return new PassCozytouchOverkizHandler(ctx);
  }

  _registerCapabilityListeners() {
    this._registerCapability('onoff', (value) =>
      this._handler.setOnOff(value));

    this._registerCapability('cozytouch_pass_level', (value) =>
      this._handler.setLevel(value));
  }

  async setPassLevel(level) {
    await this._handler.setLevel(level);
  }

}

module.exports = PassCozytouchDevice;
