'use strict';

/**
 * Main unit cozytouch_hvac_mode values.
 *
 * A heating-only heat pump (Alféa Extensa) only ever accepts heating or stop, so
 * offering Cool/Dehumidify/Automatic there would only produce commands it
 * refuses. Cooling products (Alféa Excellia, reversible circuits) get the full
 * picker, Automatic being the heating/cooling auto switch.
 */
const HEAT_PUMP_HVAC_MODE_VALUES = [
  { id: 'off', title: { en: 'Off', fr: 'Désactiver' } },
  { id: 'heat', title: { en: 'Heat', fr: 'Chauffer' } },
];

const HEAT_PUMP_HVAC_MODE_VALUES_WITH_COOLING = [
  { id: 'off', title: { en: 'Off', fr: 'Désactiver' } },
  { id: 'heat', title: { en: 'Heat', fr: 'Chauffer' } },
  { id: 'cool', title: { en: 'Cool', fr: 'Refroidir' } },
  { id: 'dry', title: { en: 'Dehumidify', fr: 'Déshumidifier' } },
  { id: 'auto', title: { en: 'Automatic', fr: 'Automatique' } },
];

/** Circuit mode (off / manual / prog) */
const HEAT_PUMP_ZONE_MODE_VALUES = [
  { id: 'off', title: { en: 'Off', fr: 'Arrêt' } },
  { id: 'manual', title: { en: 'Manual', fr: 'Manuel' } },
  { id: 'prog', title: { en: 'Program', fr: 'Programme' } },
];

/** capabilitiesOptions for a circuit's cozytouch_heating_mode */
const HEAT_PUMP_ZONE_HEATING_MODE_OPTIONS = {
  title: { en: 'Circuit Mode', fr: 'Mode du circuit' },
  values: HEAT_PUMP_ZONE_MODE_VALUES,
};

function heatPumpHvacModeValues(hasCooling) {
  return hasCooling ? HEAT_PUMP_HVAC_MODE_VALUES_WITH_COOLING : HEAT_PUMP_HVAC_MODE_VALUES;
}

module.exports = {
  HEAT_PUMP_HVAC_MODE_VALUES,
  HEAT_PUMP_HVAC_MODE_VALUES_WITH_COOLING,
  HEAT_PUMP_ZONE_MODE_VALUES,
  HEAT_PUMP_ZONE_HEATING_MODE_OPTIONS,
  heatPumpHvacModeValues,
};
