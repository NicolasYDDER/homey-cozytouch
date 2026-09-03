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

// The AQUEO ACI HYB (Magellan productId 7) implements neither the on/off (3)
// nor the target temperature (2) capability: it answered every write with
// "There is no implementation for capability Id 3 on product Id 7" while its
// tile showed no value at all.
describe('Magellan water heater without an on/off capability', () => {
  const unsupported = () => Object.assign(new Error('API request failed: 404'), {
    statusCode: 404,
    body: '{"code":36002008,"message":"There is no implementation for capability Id 3 on product Id 7.","type":"NoCapabilityImplementationFound"}',
  });

  const fakeCtx = ({ caps = [], failWrites = {} } = {}) => {
    const ctx = {
      writes: [],
      values: {},
      getCapabilities: async () => caps,
      getCapValue: (list, capId) => api.getCapabilityValue(list, capId),
      setCapValue: async (capId, value) => {
        ctx.writes.push([capId, value]);
        if (failWrites[capId]) throw failWrites[capId];
      },
      setCapability: (name, value) => { ctx.values[name] = value; },
      setCapabilityOptions: () => {},
      hasCapability: () => true,
      log: () => {},
    };
    return ctx;
  };

  it('keeps the mode the tank reports instead of showing Off', async () => {
    const ctx = fakeCtx({
      caps: [{ capabilityId: 1, value: '0' }, { capabilityId: 7, value: '52.5' }],
    });
    await new CozytouchHandler(ctx).updateState();
    assert.equal(ctx.values.cozytouch_heating_mode, 'manual');
    assert.equal(ctx.values.measure_temperature, 52.5);
  });

  it('still shows Off when the tank does report on/off', async () => {
    const ctx = fakeCtx({
      caps: [{ capabilityId: 1, value: '0' }, { capabilityId: 3, value: '0' }],
    });
    await new CozytouchHandler(ctx).updateState();
    assert.equal(ctx.values.cozytouch_heating_mode, 'off');
  });

  it('sends the mode even when the on/off write is refused', async () => {
    const ctx = fakeCtx({ failWrites: { 3: unsupported() } });
    await new CozytouchHandler(ctx).setMode('manual');
    assert.deepEqual(ctx.writes, [[3, '1'], [1, '0']]);
    assert.equal(ctx.values.cozytouch_heating_mode, 'manual');
  });

  it('propagates a real failure on the on/off write', async () => {
    const failure = Object.assign(new Error('API request failed: 401'), {
      statusCode: 401,
      body: '{"code":"900901","message":"Invalid Credentials"}',
    });
    const ctx = fakeCtx({ failWrites: { 3: failure } });
    await assert.rejects(() => new CozytouchHandler(ctx).setMode('manual'), /401/);
    assert.deepEqual(ctx.writes, [[3, '1']]);
  });
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
