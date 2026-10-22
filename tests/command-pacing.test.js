'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PendingWrites, SETTLE_MS } = require('../lib/helpers/pending-writes');
const {
  RefreshGate,
  isQuotaError,
  FIRST_WAIT_MS,
  MAX_WAIT_MS,
} = require('../lib/helpers/refresh-gate');

function clock(start = 0) {
  const time = { now: start };
  time.fn = () => time.now;
  return time;
}

describe('pending writes', () => {
  it('accepts anything for a capability nothing was written to', () => {
    const writes = new PendingWrites();
    assert.equal(writes.accepts('onoff', true), true);
    assert.equal(writes.accepts('onoff', false), true);
  });

  it('leaves out a read that disagrees with a command still settling', () => {
    const time = clock();
    const writes = new PendingWrites({ now: time.fn });
    writes.expect('cozytouch_heating_mode', 'off');

    assert.equal(writes.accepts('cozytouch_heating_mode', 'manual'), false);
    time.now += 60 * 1000;
    assert.equal(writes.accepts('cozytouch_heating_mode', 'manual'), false);
  });

  it('is done as soon as the device agrees', () => {
    const writes = new PendingWrites({ now: clock().fn });
    writes.expect('cozytouch_heating_mode', 'off');

    assert.equal(writes.accepts('cozytouch_heating_mode', 'off'), true);
    // a later change elsewhere is a change like any other
    assert.equal(writes.accepts('cozytouch_heating_mode', 'manual'), true);
  });

  it('believes the device again once the settling time is up', () => {
    const time = clock();
    const writes = new PendingWrites({ now: time.fn });
    writes.expect('target_temperature', 21);

    time.now = SETTLE_MS - 1;
    assert.equal(writes.accepts('target_temperature', 19), false);
    time.now = SETTLE_MS;
    assert.equal(writes.accepts('target_temperature', 19), true);
    assert.equal(writes.accepts('target_temperature', 18), true);
  });

  it('says so when the device never agreed, and only then', () => {
    const time = clock();
    const lines = [];
    const writes = new PendingWrites({ now: time.fn, log: (line) => lines.push(line) });

    writes.expect('onoff', false);
    writes.accepts('onoff', true); // still settling
    writes.accepts('onoff', false); // agrees
    assert.deepEqual(lines, []);

    writes.expect('onoff', false);
    time.now += SETTLE_MS;
    assert.equal(writes.accepts('onoff', true), true);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /\[onoff\] "false" was sent but the device still reports "true" 120 s later/);

    // said once: the wait is over
    writes.accepts('onoff', true);
    assert.equal(lines.length, 1);
  });

  it('keeps one wait per capability, and the latest command wins', () => {
    const time = clock();
    const writes = new PendingWrites({ now: time.fn });
    writes.expect('target_temperature', 21);
    writes.expect('target_temperature', 20.5);

    assert.equal(writes.accepts('target_temperature', 21), false);
    assert.equal(writes.accepts('target_temperature', 20.5), true);
    assert.equal(writes.accepts('onoff', false), true);
  });

  it('gives the cloud longer than the one-minute lag seen in the field', () => {
    assert.ok(SETTLE_MS > 65 * 1000);
  });
});

describe('refresh gate', () => {
  const api = {};

  it('lets a refresh through until it is refused', () => {
    const gate = new RefreshGate(clock().fn);
    assert.equal(gate.allows(api), true);
    assert.equal(gate.accepted(api), false);
  });

  it('holds the refresh back after a refusal, then tries again', () => {
    const time = clock();
    const gate = new RefreshGate(time.fn);

    assert.equal(gate.refused(api), FIRST_WAIT_MS);
    assert.equal(gate.allows(api), false);
    time.now += FIRST_WAIT_MS - 1;
    assert.equal(gate.allows(api), false);
    time.now += 1;
    assert.equal(gate.allows(api), true);
  });

  it('waits longer each time it is refused again, up to a ceiling', () => {
    const time = clock();
    const gate = new RefreshGate(time.fn);

    const waits = [];
    for (let i = 0; i < 6; i += 1) {
      waits.push(gate.refused(api));
      time.now += waits[i];
    }
    assert.deepEqual(waits, [
      FIRST_WAIT_MS,
      FIRST_WAIT_MS * 2,
      FIRST_WAIT_MS * 4,
      MAX_WAIT_MS,
      MAX_WAIT_MS,
      MAX_WAIT_MS,
    ]);
  });

  it('starts over once a refresh is accepted', () => {
    const time = clock();
    const gate = new RefreshGate(time.fn);
    gate.refused(api);
    time.now += FIRST_WAIT_MS;
    gate.refused(api);

    assert.equal(gate.accepted(api), true);
    assert.equal(gate.allows(api), true);
    assert.equal(gate.refused(api), FIRST_WAIT_MS);
  });

  it('paces each account on its own', () => {
    const gate = new RefreshGate(clock().fn);
    const other = {};
    gate.refused(api);

    assert.equal(gate.allows(api), false);
    assert.equal(gate.allows(other), true);
  });

  it('only treats a 429 as a quota refusal', () => {
    assert.equal(isQuotaError(Object.assign(new Error('Overkiz API 429: ...'), { statusCode: 429 })), true);
    assert.equal(isQuotaError(Object.assign(new Error('Overkiz API 401: ...'), { statusCode: 401 })), false);
    assert.equal(isQuotaError(new Error('Overkiz request timed out')), false);
    assert.equal(isQuotaError(null), false);
  });
});

// app.js requires 'homey', which only exists on a Homey, so the wiring is read
// from the source: a gate that nothing consults would let the quota refusals
// carry on at one a minute.
describe('sync cycle wiring', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  it('goes through the gate instead of calling refreshStates itself', () => {
    assert.match(appSource, /await this\._refreshStates\(api\);/);
    assert.equal(appSource.match(/\.refreshStates\(\)/g).length, 1, 'only _refreshStates calls it');
    assert.match(appSource, /this\._refreshGate\.allows\(api\)/);
    assert.match(appSource, /isQuotaError\(err\)/);
  });
});
