'use strict';

function controllable(deviceOrStore) {
  return deviceOrStore.controllableName
    || deviceOrStore.controllable_name
    || '';
}

function widget(deviceOrStore) {
  return deviceOrStore.widget || '';
}

/**
 * Atlantic Pass Cozytouch IO module (ref. 602251).
 * Uses setHeatingLevel only — no temperature setpoint on the module itself.
 */
function isPassCozytouch(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticElectricalHeaterIOComponent')
    || widget(deviceOrStore) === 'AtlanticElectricalHeater';
}

/**
 * Connected electric radiators with adjustable temperature setpoint
 * (Overkiz: AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint).
 * Known product: Sauter/Thermor Ipala — stays on the heater driver.
 */
function isAdjustableSetpointElectricalHeater(deviceOrStore) {
  return controllable(deviceOrStore).includes(
    'AtlanticElectricalHeaterWithAdjustableTemperatureSetpointIOComponent',
  ) || widget(deviceOrStore) === 'AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint';
}

const ADJUSTABLE_SETPOINT_TEMP_SENSOR_INDEX = 2;

function getAdjustableSetpointTemperatureSensorUrl(deviceURL) {
  if (!deviceURL) return null;
  if (/#\d+$/.test(deviceURL)) {
    return deviceURL.replace(/#\d+$/, `#${ADJUSTABLE_SETPOINT_TEMP_SENSOR_INDEX}`);
  }
  return `${deviceURL}#${ADJUSTABLE_SETPOINT_TEMP_SENSOR_INDEX}`;
}

/**
 * Shogun Zone Control helpers.
 * Overkiz still exposes these as Atlantic Pass APC Zone Control components —
 * detection strings below are protocol names, not product branding.
 */

/** Global controller (AtlanticPassAPCZoneControlMainComponent). */
function isZoneControlMain(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticPassAPCZoneControlMainComponent')
    || widget(deviceOrStore) === 'AtlanticPassAPCZoneControl';
}

/** Heating/cooling zone / room circuit. */
function isZoneControlHeatingAndCoolingZone(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticPassAPCZoneControlZoneComponent')
    && widget(deviceOrStore) === 'AtlanticPassAPCHeatingAndCoolingZone';
}

/** Zone temperature sensor endpoint (not paired as a Homey device). */
function isZoneControlZoneTemperatureSensor(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticPassAPCZoneTemperatureSensor');
}

/** Any device on the Shogun Zone Control Overkiz stack. */
function isZoneControlDevice(deviceOrStore) {
  return isZoneControlMain(deviceOrStore)
    || isZoneControlHeatingAndCoolingZone(deviceOrStore)
    || isZoneControlZoneTemperatureSensor(deviceOrStore);
}

/** Main controller is always endpoint #1 on the same Overkiz stack. */
function getZoneControlMainDeviceURL(deviceURL) {
  if (!deviceURL) return null;
  return deviceURL.replace(/#\d+$/, '#1');
}

/** Zone temperature sensor is the next endpoint index (zone #2 → sensor #3). */
function getZoneControlZoneTemperatureSensorUrl(zoneDeviceURL) {
  if (!zoneDeviceURL) return null;
  const match = zoneDeviceURL.match(/#(\d+)$/);
  if (!match) return null;
  const zoneIndex = parseInt(match[1], 10);
  return zoneDeviceURL.replace(/#\d+$/, `#${zoneIndex + 1}`);
}

module.exports = {
  isPassCozytouch,
  isAdjustableSetpointElectricalHeater,
  getAdjustableSetpointTemperatureSensorUrl,
  isZoneControlMain,
  isZoneControlHeatingAndCoolingZone,
  isZoneControlZoneTemperatureSensor,
  isZoneControlDevice,
  getZoneControlMainDeviceURL,
  getZoneControlZoneTemperatureSensorUrl,
};
