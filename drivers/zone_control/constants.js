'use strict';

/**
 * Controller cozytouch_hvac_mode values.
 * FR labels for heat/cool/off/auto match Homey native thermostat_mode;
 * dry has no Homey equivalent → verb form Déshumidifier.
 */
const ZONE_CONTROL_HVAC_MODE_VALUES = [
  { id: 'off', title: { en: 'Off', fr: 'Désactiver' } },
  { id: 'heat', title: { en: 'Heat', fr: 'Chauffer' } },
  { id: 'cool', title: { en: 'Cool', fr: 'Refroidir' } },
  { id: 'dry', title: { en: 'Dehumidify', fr: 'Déshumidifier' } },
  { id: 'auto', title: { en: 'Automatic', fr: 'Automatique' } },
];

/** Zone circuit mode (off / manual / prog) */
const ZONE_CONTROL_ZONE_MODE_VALUES = [
  { id: 'off', title: { en: 'Off', fr: 'Arrêt' } },
  { id: 'manual', title: { en: 'Manual', fr: 'Manuel' } },
  { id: 'prog', title: { en: 'Program', fr: 'Programme' } },
];

/** capabilitiesOptions for zone cozytouch_heating_mode */
const ZONE_CONTROL_ZONE_HEATING_MODE_OPTIONS = {
  title: { en: 'Zone Mode', fr: 'Mode de la zone' },
  values: ZONE_CONTROL_ZONE_MODE_VALUES,
};

module.exports = {
  ZONE_CONTROL_HVAC_MODE_VALUES,
  ZONE_CONTROL_ZONE_MODE_VALUES,
  ZONE_CONTROL_ZONE_HEATING_MODE_OPTIONS,
};
