'use strict';

const CozyTouchDriver = require('../../lib/CozyTouchDriver');
const { PASS_APC_COMMANDS } = require('../../lib/constants/overkiz-mappings');
const { supportedCommandNames } = require('../../lib/helpers/overkiz-commands');
const {
  isPassApcHeatPumpMain,
  isPassApcHeatPumpZone,
  isPassApcOutsideTemperatureSensor,
  isPassApcZoneTemperatureSensor,
  overkizStackBaseUrl,
  findStackSibling,
} = require('../../lib/helpers/overkiz-device');

/**
 * Atlantic Pass APC heat pumps (Alféa Extensa / Excellia, Hydrapac…).
 *
 * Pairs the main unit and every heating circuit. The probes of the stack are not
 * paired: the main unit reads the outside probe and each circuit reads its own
 * room probe. The hot water tank of a Duo is an AtlanticPassAPCDHWComponent and
 * belongs to the water_heater driver.
 */
class HeatPumpDriver extends CozyTouchDriver {

  _filterDevices(allDevices) {
    // Kept for _mapOverkizDevice: the endpoints of one heat pump only make sense
    // together (a circuit needs its main unit and its probe), and Homey hands the
    // mapper one device at a time.
    this._discovered = allDevices;

    return allDevices.filter((dev) => {
      if (dev._protocol !== 'overkiz') return false;
      return isPassApcHeatPumpMain(dev) || isPassApcHeatPumpZone(dev);
    });
  }

  /**
   * Whether the stack can cool. Read from what the product advertises rather
   * than from its model name: Extensa units are heating-only, Excellia and
   * reversible circuits also cool, and sending a cooling command to the former
   * is refused by the heat pump.
   */
  _stackHasCooling(dev) {
    const commands = supportedCommandNames(dev);
    if (commands.includes(PASS_APC_COMMANDS.SET_COOLING_MODE)
      || commands.includes(PASS_APC_COMMANDS.SET_COOLING_ON_OFF)
      || commands.includes(PASS_APC_COMMANDS.SET_AUTO_SWITCH)) {
      return true;
    }

    const base = overkizStackBaseUrl(dev.deviceURL);
    return (this._discovered || []).some((sibling) => sibling
      && overkizStackBaseUrl(sibling.deviceURL) === base
      && String(sibling.widget || '').includes('AndCooling'));
  }

  _mapOverkizDevice(dev) {
    const base = super._mapOverkizDevice(dev);
    const devices = this._discovered || [];

    base.store.passApcCooling = this._stackHasCooling(dev);

    if (isPassApcHeatPumpMain(dev)) {
      const outsideProbe = findStackSibling(devices, dev.deviceURL, isPassApcOutsideTemperatureSensor);
      base.store.passApcRole = 'main';
      base.store.passApcOutsideSensorURL = outsideProbe ? outsideProbe.deviceURL : null;
      base.capabilities = ['cozytouch_hvac_mode', 'onoff'];
      if (outsideProbe) {
        base.capabilities.push('measure_temperature');
        base.capabilitiesOptions = {
          measure_temperature: {
            title: { en: 'Outside temperature', fr: 'Température extérieure' },
          },
        };
      }
      return base;
    }

    const mainUnit = findStackSibling(devices, dev.deviceURL, isPassApcHeatPumpMain);
    const roomProbe = findStackSibling(devices, dev.deviceURL, isPassApcZoneTemperatureSensor);
    base.store.passApcRole = 'zone';
    base.store.passApcMainDeviceURL = mainUnit ? mainUnit.deviceURL : null;
    base.store.passApcTemperatureSensorURL = roomProbe ? roomProbe.deviceURL : null;
    base.capabilities = [
      'target_temperature',
      'measure_temperature',
      'cozytouch_heating_mode',
      'onoff',
    ];
    // thermostat_mode only carries the heat/cool tile colors, so it is pointless
    // on a heating-only heat pump.
    if (base.store.passApcCooling) {
      base.capabilities.push('thermostat_mode');
    }
    base.capabilitiesOptions = {
      target_temperature: {
        min: 16,
        max: 30,
        step: 0.5,
      },
    };
    return base;
  }

}

module.exports = HeatPumpDriver;
