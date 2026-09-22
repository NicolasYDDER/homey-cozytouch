'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  mappedCapabilityIds,
  reportsMappedCapability,
} = require('../lib/helpers/capability-support');
const {
  TOWEL_RACK_CAP_IDS,
  climateCapIds,
  waterHeaterCapIds,
} = require('../lib/constants/cozytouch-mappings');

// TESC_0 as an Alféa Extensa S Duo 8 account reports it: a heating circuit, not
// a towel dryer. 19 is temperature_setpoint, 109 boiler_water_temperature, 218 a
// wifi flag and 106000 circuit_driven_by_room.
const TESC_0 = {
  _protocol: 'cozytouch',
  name: 'TESC_0 DEFAULT',
  deviceId: 28050066,
  modelId: 1388,
  productId: 55,
  capabilities: [
    { capabilityId: 19, value: '0.0000000000000000000' },
    { capabilityId: 109, value: '22.47000000000000000000' },
    { capabilityId: 218, value: '0' },
    { capabilityId: 106000, value: '1' },
  ],
};

// ROOM_1 from the same account: nothing on the AC IDs, but plenty on its own.
const ROOM_1 = {
  _protocol: 'cozytouch',
  name: 'ROOM_1',
  deviceId: 28050069,
  modelId: 558,
  productId: 27,
  capabilities: [
    { capabilityId: 7, value: '4' },
    { capabilityId: 40, value: '20.0' },
    { capabilityId: 160, value: '10.0' },
    { capabilityId: 161, value: '35.0' },
  ],
};

// The DHW tank of the same heat pump.
const DHW_0 = {
  _protocol: 'cozytouch',
  name: 'DHW_0 DEFAULT',
  modelId: 1376,
  productId: 47,
  capabilities: [
    { capabilityId: 86, value: '1' },
    { capabilityId: 87, value: '2' },
    { capabilityId: 111, value: '53.42000000000000000000' },
    { capabilityId: 231, value: '55.0000000000000000000' },
  ],
};

describe('mappedCapabilityIds', () => {
  it('lists the numeric IDs of a block', () => {
    const ids = mappedCapabilityIds({ A: 7, B: 40, C: 117 });
    assert.deepEqual(ids.sort((a, b) => a - b), [7, 40, 117]);
  });

  it('drops the capabilities a product does not have', () => {
    // null is how a per-product block says "no such capability here".
    const ids = mappedCapabilityIds(climateCapIds(27));
    assert.ok(!ids.includes(4), 'fan speed is not mapped on a heating zone');
    assert.ok(!ids.includes(9), 'swing is not mapped on a heating zone');
    assert.ok(ids.includes(7) && ids.includes(40) && ids.includes(118));
  });

  it('de-duplicates IDs a block maps twice', () => {
    // The AQUEO reports its setpoint on both 231 and 22.
    const ids = mappedCapabilityIds({ TARGET: 231, TARGET_ALT: 231 });
    assert.deepEqual(ids, [231]);
  });

  it('survives anything that is not a block', () => {
    assert.deepEqual(mappedCapabilityIds(null), []);
    assert.deepEqual(mappedCapabilityIds(undefined), []);
    assert.deepEqual(mappedCapabilityIds('nonsense'), []);
    assert.deepEqual(mappedCapabilityIds({ A: null, B: undefined, C: 'x' }), []);
  });
});

describe('reportsMappedCapability', () => {
  it('rejects a device that reports none of the IDs the driver reads', () => {
    // The whole point: TESC_0 was classified as a towel rack and paired into a
    // device with no value on any tile.
    const towelIds = mappedCapabilityIds(TOWEL_RACK_CAP_IDS);
    assert.equal(reportsMappedCapability(TESC_0, towelIds), false);
  });

  it('accepts a device that reports at least one', () => {
    assert.equal(
      reportsMappedCapability(ROOM_1, mappedCapabilityIds(climateCapIds(27))),
      true,
    );
    assert.equal(
      reportsMappedCapability(DHW_0, mappedCapabilityIds(waterHeaterCapIds(47))),
      true,
    );
  });

  it('matches IDs whatever type the API sent them as', () => {
    const asStrings = { ...TESC_0, capabilities: [{ capabilityId: '19', value: '0' }] };
    assert.equal(reportsMappedCapability(asStrings, [19]), true);
    assert.equal(reportsMappedCapability(asStrings, ['19']), true);
  });

  it('keeps a device whose capabilities were not part of the discovery', () => {
    // Unseen is not the same as unsupported: hiding it would trade a device that
    // shows nothing for one that cannot be added at all.
    assert.equal(reportsMappedCapability({ _protocol: 'cozytouch', modelId: 1 }, [7]), true);
    assert.equal(reportsMappedCapability({ ...TESC_0, capabilities: [] }, [7]), true);
  });

  it('never judges an Overkiz device', () => {
    // Overkiz devices are filtered on controllableName, and carry no Magellan
    // capability list at all.
    const overkiz = { _protocol: 'overkiz', controllableName: 'io:SomeComponent' };
    assert.equal(reportsMappedCapability(overkiz, [7, 40]), true);
  });

  it('keeps a device when the driver maps nothing', () => {
    assert.equal(reportsMappedCapability(TESC_0, []), true);
    assert.equal(reportsMappedCapability(TESC_0, null), true);
  });

  it('survives a missing device', () => {
    assert.equal(reportsMappedCapability(null, [7]), true);
  });
});
