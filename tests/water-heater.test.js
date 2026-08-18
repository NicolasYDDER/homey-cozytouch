'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CozyTouchAPI = require('../lib/CozyTouchAPI');
const { supportedWaterHeaterModes } = require('../lib/helpers/water-heater-modes');
const { describeDiscoveredDevices } = require('../lib/helpers/discovery-report');

const CozytouchHandler = require('../drivers/water_heater/handlers/cozytouch');
const OverkizHandler = require('../drivers/water_heater/handlers/overkiz');
const OverkizMblHandler = require('../drivers/water_heater/handlers/overkiz-mbl');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));

const api = new CozyTouchAPI({});

describe('Magellan model classification', () => {
  // issue #5: seen by discovery as type UNKNOWN, so it never reached pairing.
  it('classifies the Calypso connecté (1658) as a water heater', () => {
    assert.equal(api.getDeviceType(1658), 'WATER_HEATER');
  });

  it('keeps the known water heater family classified', () => {
    for (const modelId of [236, 389, 390, 1369, 1371, 1372, 1376, 1642, 1644, 1645, 1656, 1657, 1658, 1966]) {
      assert.equal(api.getDeviceType(modelId), 'WATER_HEATER', `modelId ${modelId}`);
    }
  });

  it('never puts one model in two families', () => {
    const seen = new Map();
    for (const [type, ids] of Object.entries(CozyTouchAPI.MODEL_TYPES)) {
      for (const id of ids) {
        assert.equal(seen.has(id), false, `modelId ${id} is both ${seen.get(id)} and ${type}`);
        seen.set(id, type);
      }
    }
  });

  it('reports anything else as UNKNOWN', () => {
    assert.equal(api.getDeviceType(999999), 'UNKNOWN');
  });
});

// A water heater device calls these on whatever handler its protocol resolves
// to; a missing one is a TypeError the moment the user touches the tile. The
// Magellan handler had no setBoost at all until the Calypso made it reachable.
describe('water heater handler surface', () => {
  const REQUIRED = ['setTargetTemperature', 'setMode', 'setBoost', 'setAwayMode', 'updateState'];

  for (const [name, Handler] of Object.entries({
    cozytouch: CozytouchHandler,
    overkiz: OverkizHandler,
    'overkiz-mbl': OverkizMblHandler,
  })) {
    it(`${name} implements every method the driver calls`, () => {
      const handler = new Handler({});
      for (const method of REQUIRED) {
        assert.equal(typeof handler[method], 'function', `${name} handler is missing ${method}()`);
      }
    });
  }
});

describe('water heater mode picker', () => {
  const declared = manifest.capabilities.cozytouch_heating_mode.values.map((v) => v.id);

  it('only offers modes declared in the capability enum', () => {
    const shapes = [
      { protocol: 'overkiz', isMbl: false },
      { protocol: 'overkiz', isMbl: true },
      { protocol: 'cozytouch', isMbl: false },
    ];
    for (const shape of shapes) {
      for (const mode of supportedWaterHeaterModes(shape)) {
        assert.ok(declared.includes(mode), `${mode} is not a cozytouch_heating_mode value`);
      }
    }
  });
});

describe('discovery report', () => {
  it('names Magellan devices with the modelId support is keyed on', () => {
    assert.equal(
      describeDiscoveredDevices([
        { _protocol: 'cozytouch', name: 'Calypso connecté', deviceId: 27705295, modelId: 1658 },
      ]),
      'Calypso connecté (modelId 1658)',
    );
  });

  it('names Overkiz devices with their controllableName', () => {
    assert.equal(
      describeDiscoveredDevices([
        {
          _protocol: 'overkiz',
          label: 'Chauffe-eau',
          controllableName: 'io:AtlanticDomesticHotWaterProductionMBLComponent',
        },
      ]),
      'Chauffe-eau (io:AtlanticDomesticHotWaterProductionMBLComponent)',
    );
  });

  it('truncates long lists and stays empty when there is nothing to report', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      _protocol: 'cozytouch', name: `Device ${i}`, modelId: 100 + i,
    }));
    assert.equal(describeDiscoveredDevices(many, 2), 'Device 0 (modelId 100), Device 1 (modelId 101), +3');
    assert.equal(describeDiscoveredDevices([]), '');
    assert.equal(describeDiscoveredDevices(undefined), '');
  });
});
