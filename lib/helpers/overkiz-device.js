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

/**
 * Atlantic Pass APC heat pumps (Alféa Extensa / Excellia, Hydrapac…).
 *
 * Overkiz splits one heat pump into several endpoints of the same io:// stack: a
 * main component carrying the system mode, one component per heating circuit, a
 * DHW component on a Duo, plus temperature and energy probes. Detection is on
 * the component (or widget) name and never on the endpoint index — indexes
 * differ per product: the Alféa Extensa Duo A.I. (modelId 212) puts its main
 * unit on #1, DHW on #2, outside probe on #3 and a floor circuit on #8.
 *
 * The protocol is the one the Shogun Zone Control already speaks (io:PassAPC*),
 * only the component names differ, so the Shogun stack has to lose every match
 * below — it keeps its own driver.
 */

const PASS_APC_ZONE_WIDGETS = [
  'AtlanticPassAPCHeatingZone',
  'AtlanticPassAPCHeatingAndCoolingZone',
];

/** Main unit (AtlanticPassAPCHeatPumpMainComponent) — holds the system mode. */
function isPassApcHeatPumpMain(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticPassAPCHeatPumpMainComponent')
    || widget(deviceOrStore) === 'AtlanticPassAPCHeatPump';
}

/** One heating (or heating/cooling) circuit of a Pass APC heat pump. */
function isPassApcHeatPumpZone(deviceOrStore) {
  if (isZoneControlDevice(deviceOrStore)) return false;
  if (PASS_APC_ZONE_WIDGETS.includes(widget(deviceOrStore))) return true;
  return /AtlanticPassAPC(?:Heating(?:AndCooling)?)?ZoneComponent/
    .test(controllable(deviceOrStore));
}

/** Hot water tank of a Duo (AtlanticPassAPCDHWComponent). */
function isPassApcDhw(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticPassAPCDHWComponent')
    || widget(deviceOrStore) === 'AtlanticPassAPCDHW';
}

/** Outside probe of the stack (read by the main unit, never paired on its own). */
function isPassApcOutsideTemperatureSensor(deviceOrStore) {
  return controllable(deviceOrStore).includes('AtlanticPassAPCOutsideTemperatureSensor');
}

/**
 * Circuit probe. Both Pass APC families use the same component here;
 * isZoneControlZoneTemperatureSensor is the historical name for it.
 */
const isPassApcZoneTemperatureSensor = isZoneControlZoneTemperatureSensor;

/** Any endpoint the heat_pump driver claims (main unit + circuits). */
function isPassApcHeatPumpDevice(deviceOrStore) {
  return isPassApcHeatPumpMain(deviceOrStore) || isPassApcHeatPumpZone(deviceOrStore);
}

// ── Overkiz stack (endpoints of one physical product) ────────────

/** Endpoints of one product share everything before the `#index`. */
function overkizStackBaseUrl(deviceURL) {
  if (!deviceURL) return null;
  return deviceURL.replace(/#\d+$/, '');
}

function overkizEndpointIndex(deviceURL) {
  const match = (deviceURL || '').match(/#(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Sibling endpoint of `deviceURL` that `predicate` accepts, looked up by name in
 * the discovered device list rather than by a fixed index offset. A two-circuit
 * product lists a probe after each circuit, so the nearest endpoint above wins,
 * falling back to the first match on the stack (the main unit sits below its
 * circuits).
 */
function findStackSibling(devices, deviceURL, predicate) {
  const base = overkizStackBaseUrl(deviceURL);
  if (!base) return null;

  const siblings = (devices || []).filter((dev) => dev
    && dev.deviceURL !== deviceURL
    && overkizStackBaseUrl(dev.deviceURL) === base
    && predicate(dev));
  if (siblings.length === 0) return null;

  const index = overkizEndpointIndex(deviceURL);
  if (index === null) return siblings[0];

  const above = siblings
    .filter((dev) => overkizEndpointIndex(dev.deviceURL) > index)
    .sort((a, b) => overkizEndpointIndex(a.deviceURL) - overkizEndpointIndex(b.deviceURL));
  return above[0] || siblings[0];
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
  isPassApcHeatPumpMain,
  isPassApcHeatPumpZone,
  isPassApcHeatPumpDevice,
  isPassApcDhw,
  isPassApcOutsideTemperatureSensor,
  isPassApcZoneTemperatureSensor,
  overkizStackBaseUrl,
  overkizEndpointIndex,
  findStackSibling,
};
