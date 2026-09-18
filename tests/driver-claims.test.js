'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  groupByClaimingDriver,
  describeClaimingDrivers,
  localizedName,
  listOf,
} = require('../lib/helpers/driver-claims');

// The account that motivated this: an Alféa Extensa S Duo 8 announced only over
// Magellan. Its owner picked the "Heat Pump (Alféa / Pass APC)" tile — the one
// whose name matches the appliance — which is Overkiz-only, and was told no
// compatible device existed while five of these seven pair elsewhere.
const EXTENSA_ACCOUNT = [
  { _protocol: 'cozytouch', name: 'Alfea Extensa S', modelId: 2303, productId: 54 },
  { _protocol: 'cozytouch', name: 'TESC_0 DEFAULT', modelId: 1388, productId: 55 },
  { _protocol: 'cozytouch', name: 'TESC_1 DEFAULT', modelId: 1389, productId: 56 },
  { _protocol: 'cozytouch', name: 'ROOM_0', modelId: 557, productId: 26 },
  { _protocol: 'cozytouch', name: 'ROOM_1', modelId: 558, productId: 27 },
  { _protocol: 'cozytouch', name: 'DHW_0 DEFAULT', modelId: 1376, productId: 47 },
  { _protocol: 'cozytouch', name: 'Alfea Extensa S', modelId: 2327, productId: 58 },
];

const claimsModels = (name, modelIds) => ({
  name,
  claims: (dev) => modelIds.includes(dev.modelId),
});

describe('driver claims', () => {
  it('names the device type that would pair each device', () => {
    const { claimed, unclaimed } = groupByClaimingDriver(EXTENSA_ACCOUNT, [
      claimsModels('Heat Pump / AC', [557, 558]),
      claimsModels('Water Heater', [1376]),
      claimsModels('Towel Rack', [1388, 1389]),
    ]);

    // Grouped in the order the drivers were passed, not the order the account
    // announced them: that is the order of the tiles the user is looking at.
    assert.deepEqual(claimed, [
      { driver: 'Heat Pump / AC', devices: ['ROOM_0', 'ROOM_1'] },
      { driver: 'Water Heater', devices: ['DHW_0 DEFAULT'] },
      { driver: 'Towel Rack', devices: ['TESC_0 DEFAULT', 'TESC_1 DEFAULT'] },
    ]);
    // The two endpoints of the appliance itself: nothing claims them. They come
    // back as devices, so the caller can name them with the modelId a report
    // needs rather than the bare name a user recognizes.
    assert.deepEqual(unclaimed.map((dev) => dev.modelId), [2303, 2327]);
  });

  it('lists a device claimed by two device types under both', () => {
    const { claimed, unclaimed } = groupByClaimingDriver(
      [{ _protocol: 'overkiz', label: 'Sèche-serviettes', controllableName: 'io:TowelDryer' }],
      [claimsModels('Radiator / Heating', []), { name: 'Towel Rack', claims: () => true }, { name: 'Radiator / Heating', claims: () => true }],
    );

    assert.deepEqual(claimed.map((entry) => entry.driver), ['Towel Rack', 'Radiator / Heating']);
    assert.deepEqual(unclaimed, []);
  });

  it('keeps going when one device type throws on an unexpected device', () => {
    const { claimed, unclaimed } = groupByClaimingDriver(EXTENSA_ACCOUNT.slice(3, 5), [
      { name: 'Broken', claims: () => { throw new Error('nope'); } },
      claimsModels('Heat Pump / AC', [557, 558]),
    ]);

    assert.deepEqual(claimed.map((entry) => entry.driver), ['Heat Pump / AC']);
    assert.deepEqual(unclaimed, []);
  });

  it('survives an empty account and a driver list full of nothing', () => {
    assert.deepEqual(groupByClaimingDriver([], []), { claimed: [], unclaimed: [] });
    assert.deepEqual(groupByClaimingDriver(undefined, undefined), { claimed: [], unclaimed: [] });
    const { claimed, unclaimed } = groupByClaimingDriver(EXTENSA_ACCOUNT.slice(0, 1), [null, {}, { name: 'x' }]);
    assert.deepEqual(claimed, []);
    assert.deepEqual(unclaimed.map((dev) => dev.modelId), [2303]);
  });
});

describe('driver claims sentence', () => {
  it('reads as the tiles to try, each with what it would pair', () => {
    assert.equal(
      describeClaimingDrivers([
        { driver: 'Water Heater', devices: ['DHW_0'] },
        { driver: 'Towel Rack', devices: ['TESC_0', 'TESC_1'] },
      ]),
      'Water Heater (DHW_0), Towel Rack (TESC_0, TESC_1)',
    );
  });

  it('caps both the device types and their devices', () => {
    const devices = ['a', 'b', 'c', 'd', 'e', 'f'];
    assert.equal(describeClaimingDrivers([{ driver: 'One', devices }], 2), 'One (a, b, +4)');
    assert.equal(
      describeClaimingDrivers(Array.from({ length: 4 }, (_, i) => ({ driver: `D${i}`, devices: ['x'] })), 2),
      'D0 (x), D1 (x), +2',
    );
    assert.equal(describeClaimingDrivers([{ driver: 'All', devices }], Number.POSITIVE_INFINITY), 'All (a, b, c, d, e, f)');
  });

  it('stays empty when nothing is claimed', () => {
    assert.equal(describeClaimingDrivers([]), '');
    assert.equal(describeClaimingDrivers(undefined), '');
    assert.equal(describeClaimingDrivers([{ driver: 'Empty', devices: [] }]), '');
    assert.equal(listOf([]), '');
  });
});

describe('driver display name', () => {
  it('prefers the user language, falls back to English then anything', () => {
    const name = { en: 'Towel Rack', fr: 'Sèche-serviettes' };
    assert.equal(localizedName(name, 'fr'), 'Sèche-serviettes');
    assert.equal(localizedName(name, 'nl'), 'Towel Rack');
    assert.equal(localizedName({ nl: 'Handdoekdroger' }, 'fr'), 'Handdoekdroger');
    assert.equal(localizedName('Pass Cozytouch', 'fr'), 'Pass Cozytouch');
    assert.equal(localizedName(undefined, 'en'), null);
    assert.equal(localizedName({}, 'en'), null);
  });
});
