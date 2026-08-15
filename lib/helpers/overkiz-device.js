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
 * (e.g. Sauter/Thermor Ipala).
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

/** Atlantic Pass APC global zone controller (Shogun Zone Control 2.0). */
function isPassAPCZoneControlMain(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticPassAPCZoneControlMainComponent')
    || widget(deviceOrStore) === 'AtlanticPassAPCZoneControl';
}

/** Atlantic Pass APC heating/cooling zone (room circuit). */
function isPassAPCHeatingAndCoolingZone(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticPassAPCZoneControlZoneComponent')
    && widget(deviceOrStore) === 'AtlanticPassAPCHeatingAndCoolingZone';
}

function isPassAPCZoneTemperatureSensor(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticPassAPCZoneTemperatureSensor');
}

function isPassAPCDevice(deviceOrStore) {
  return isPassAPCZoneControlMain(deviceOrStore)
    || isPassAPCHeatingAndCoolingZone(deviceOrStore)
    || isPassAPCZoneTemperatureSensor(deviceOrStore);
}

/** Main controller is always endpoint #1 on the same Overkiz stack. */
function getPassAPCMainDeviceURL(deviceURL) {
  if (!deviceURL) return null;
  return deviceURL.replace(/#\d+$/, '#1');
}

/** Zone temperature sensor is the next endpoint index (zone #2 → sensor #3). */
function getPassAPCZoneTemperatureSensorUrl(zoneDeviceURL) {
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
  isPassAPCZoneControlMain,
  isPassAPCHeatingAndCoolingZone,
  isPassAPCZoneTemperatureSensor,
  isPassAPCDevice,
  getPassAPCMainDeviceURL,
  getPassAPCZoneTemperatureSensorUrl,
};
