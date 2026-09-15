'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { excludeAlreadyPaired } = require('../lib/helpers/pairing');

describe('excludeAlreadyPaired', () => {
  const candidates = [
    { name: 'Salon', data: { id: 'ovkz_io_abc_1' } },
    { name: 'Cuisine', data: { id: 'ovkz_io_abc_2' } },
    { name: 'Chambre', data: { id: 'cozy_42', accountDeviceId: '42' } },
  ];

  it('keeps every candidate when nothing is paired yet', () => {
    assert.deepEqual(excludeAlreadyPaired(candidates, []), candidates);
  });

  it('drops a candidate whose data.id matches a legacy device (extra credentials in data)', () => {
    // Devices paired ≤1.3.6 still carry username/password; Homey's built-in
    // filter compares the whole data object and would miss this match.
    const paired = [
      {
        getData: () => ({
          id: 'ovkz_io_abc_1',
          username: 'user@example.com',
          password: 'secret',
        }),
      },
    ];
    const result = excludeAlreadyPaired(candidates, paired);
    assert.deepEqual(
      result.map((d) => d.data.id),
      ['ovkz_io_abc_2', 'cozy_42'],
    );
  });

  it('drops a candidate whose data.id matches a current-shape paired device', () => {
    const paired = [{ getData: () => ({ id: 'cozy_42', accountDeviceId: '42' }) }];
    const result = excludeAlreadyPaired(candidates, paired);
    assert.equal(result.some((d) => d.data.id === 'cozy_42'), false);
    assert.equal(result.length, 2);
  });

  it('accepts plain { data } stubs (no getData)', () => {
    const result = excludeAlreadyPaired(candidates, [{ data: { id: 'ovkz_io_abc_2' } }]);
    assert.equal(result.length, 2);
    assert.equal(result.some((d) => d.data.id === 'ovkz_io_abc_2'), false);
  });

  it('returns an empty list when every candidate is already paired', () => {
    const paired = candidates.map((c) => ({ getData: () => ({ ...c.data }) }));
    assert.deepEqual(excludeAlreadyPaired(candidates, paired), []);
  });
});
