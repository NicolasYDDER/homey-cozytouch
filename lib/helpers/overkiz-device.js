'use strict';

/**
 * Atlantic fil pilote interface (ref. 602251) behind non-connected heaters/towel racks.
 * Uses setHeatingLevel only — no temperature setpoint on the IO module itself.
 */
function isFilPiloteElectricalHeater(deviceOrStore) {
  const controllable = deviceOrStore.controllableName
    || deviceOrStore.controllable_name
    || '';
  const widget = deviceOrStore.widget || '';

  return controllable.includes('AtlanticElectricalHeaterIOComponent')
    || widget === 'AtlanticElectricalHeater';
}

module.exports = {
  isFilPiloteElectricalHeater,
};
