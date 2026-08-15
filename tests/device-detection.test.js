'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isPassCozytouch,
  isAdjustableSetpointElectricalHeater,
  isPassAPCZoneControlMain,
  isPassAPCHeatingAndCoolingZone,
  isPassAPCZoneTemperatureSensor,
  isPassAPCDevice,
  getPassAPCMainDeviceURL,
  getPassAPCZoneTemperatureSensorUrl,
  getAdjustableSetpointTemperatureSensorUrl,
} = require('../lib/helpers/overkiz-device');

const {
  PASS_COZYTOUCH_LEVELS,
  PASS_APC_OPERATING_TO_HVAC,
  HVAC_TO_PASS_APC_OPERATING,
  PASS_APC_ZONE_MODE_TO_OVERKIZ,
  PASS_APC_OVERKIZ_TO_ZONE_MODE,
  MODE_TO_ADJUSTABLE_SETPOINT,
} = require('../lib/constants/overkiz-mappings');

const FIXTURES = {
  passCozytouch: {
    label: 'PASS_Actuator',
    controllableName: 'io:AtlanticElectricalHeaterIOComponent',
    widget: 'AtlanticElectricalHeater',
    deviceURL: 'io://0000-0000-0000/1111111',
  },
  ipala: {
    label: 'Radiateur',
    controllableName: 'io:AtlanticElectricalHeaterWithAdjustableTemperatureSetpointIOComponent',
    widget: 'AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint',
    deviceURL: 'io://0000-0000-0000/2222222#1',
  },
  zoneControl: {
    label: 'Zone Control',
    controllableName: 'io:AtlanticPassAPCZoneControlMainComponent',
    widget: 'AtlanticPassAPCZoneControl',
    deviceURL: 'io://0000-0000-0000/3333333#1',
  },
  zone: {
    label: 'Zone 1',
    controllableName: 'io:AtlanticPassAPCZoneControlZoneComponent',
    widget: 'AtlanticPassAPCHeatingAndCoolingZone',
    deviceURL: 'io://0000-0000-0000/3333333#2',
  },
  zoneSensor: {
    label: 'IO',
    controllableName: 'io:AtlanticPassAPCZoneTemperatureSensor',
    widget: 'TemperatureSensor',
    deviceURL: 'io://0000-0000-0000/3333333#3',
  },
};

describe('overkiz-device helpers', () => {
  it('detects Pass Cozytouch modules', () => {
    assert.equal(isPassCozytouch(FIXTURES.passCozytouch), true);
    assert.equal(isPassCozytouch(FIXTURES.ipala), false);
    assert.equal(isPassCozytouch(FIXTURES.zoneControl), false);
  });

  it('detects Ipala adjustable-setpoint heaters', () => {
    assert.equal(isAdjustableSetpointElectricalHeater(FIXTURES.ipala), true);
    assert.equal(isAdjustableSetpointElectricalHeater(FIXTURES.passCozytouch), false);
  });

  it('detects Pass APC roles', () => {
    assert.equal(isPassAPCZoneControlMain(FIXTURES.zoneControl), true);
    assert.equal(isPassAPCHeatingAndCoolingZone(FIXTURES.zone), true);
    assert.equal(isPassAPCZoneTemperatureSensor(FIXTURES.zoneSensor), true);
    assert.equal(isPassAPCDevice(FIXTURES.zoneControl), true);
    assert.equal(isPassAPCDevice(FIXTURES.passCozytouch), false);
  });

  it('builds Pass APC related URLs', () => {
    assert.equal(
      getPassAPCMainDeviceURL(FIXTURES.zone.deviceURL),
      'io://0000-0000-0000/3333333#1',
    );
    assert.equal(
      getPassAPCZoneTemperatureSensorUrl(FIXTURES.zone.deviceURL),
      'io://0000-0000-0000/3333333#3',
    );
    assert.equal(
      getAdjustableSetpointTemperatureSensorUrl(FIXTURES.ipala.deviceURL),
      'io://0000-0000-0000/2222222#2',
    );
  });
});

describe('overkiz mappings', () => {
  it('exposes the six Pass Cozytouch levels', () => {
    assert.deepEqual(PASS_COZYTOUCH_LEVELS, [
      'off',
      'frostprotection',
      'eco',
      'comfort-2',
      'comfort-1',
      'comfort',
    ]);
  });

  it('maps Pass APC operating modes including round-trip HVAC', () => {
    assert.equal(PASS_APC_OPERATING_TO_HVAC.heating, 'heat');
    assert.equal(PASS_APC_OPERATING_TO_HVAC.cooling, 'cool');
    assert.equal(PASS_APC_OPERATING_TO_HVAC.drying, 'dry');
    assert.equal(PASS_APC_OPERATING_TO_HVAC.stop, 'off');
    assert.equal(HVAC_TO_PASS_APC_OPERATING.heat, 'heating');
    assert.equal(HVAC_TO_PASS_APC_OPERATING.auto, undefined);
  });

  it('maps zone modes off/manual/prog', () => {
    assert.equal(PASS_APC_ZONE_MODE_TO_OVERKIZ.off, 'stop');
    assert.equal(PASS_APC_ZONE_MODE_TO_OVERKIZ.manual, 'manu');
    assert.equal(PASS_APC_ZONE_MODE_TO_OVERKIZ.prog, 'internalScheduling');
    assert.equal(PASS_APC_OVERKIZ_TO_ZONE_MODE.manu, 'manual');
    assert.equal(PASS_APC_OVERKIZ_TO_ZONE_MODE.internalScheduling, 'prog');
  });

  it('maps Ipala modes to dump-backed commands', () => {
    assert.deepEqual(MODE_TO_ADJUSTABLE_SETPOINT.off, {
      command: 'setOperatingMode',
      value: 'standby',
    });
    assert.deepEqual(MODE_TO_ADJUSTABLE_SETPOINT.manual, {
      command: 'setOperatingMode',
      value: 'basic',
    });
    assert.deepEqual(MODE_TO_ADJUSTABLE_SETPOINT.prog, {
      command: 'setOperatingMode',
      value: 'internal',
    });
    assert.deepEqual(MODE_TO_ADJUSTABLE_SETPOINT.eco_plus, {
      command: 'setHeatingLevel',
      value: 'eco',
    });
  });
});
