'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const PassCozytouchOverkizHandler = require('../drivers/pass_cozytouch/handlers/overkiz');
const { PendingWrites, SETTLE_MS } = require('../lib/helpers/pending-writes');
const { STATES } = require('../lib/constants/overkiz-mappings');

function passStates(overrides = {}) {
  const base = {
    [STATES.ON_OFF]: 'on',
    [STATES.TARGET_HEATING_LEVEL]: 'comfort',
  };
  return Object.entries({ ...base, ...overrides })
    .map(([name, value]) => ({ name, value }));
}

function setup({ states = passStates() } = {}) {
  const capabilities = new Map();
  const calls = { executed: [], logs: [] };

  const ctx = {
    deviceURL: 'io://0000-0000-0000/1',
    store: {},
    log: (line) => calls.logs.push(line),
    error: () => {},
    hasCapability: (name) => true,
    setCapability: (name, value) => { capabilities.set(name, value); },
    executeCommand: async (cmd, params) => {
      calls.executed.push([cmd, params]);
    },
    getDeviceState: async () => states,
  };

  return { handler: new PassCozytouchOverkizHandler(ctx), capabilities, calls, ctx };
}

describe('Pass Cozytouch Overkiz handler', () => {
  it('reads io:TargetHeatingLevelState (not a missing HEATING_LEVEL key)', async () => {
    const { handler, capabilities } = setup({
      states: passStates({ [STATES.TARGET_HEATING_LEVEL]: 'eco' }),
    });
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_pass_level'), 'eco');
    assert.equal(capabilities.get('onoff'), true);
  });

  it('sends setHeatingLevel and shows the new mode on the tile', async () => {
    const { handler, capabilities, calls } = setup();
    await handler.setLevel('frostprotection');
    assert.deepEqual(calls.executed, [['setHeatingLevel', ['frostprotection']]]);
    assert.equal(capabilities.get('cozytouch_pass_level'), 'frostprotection');
    assert.equal(capabilities.get('onoff'), true);
  });

  it('keeps a Flow-set mode when the next poll still returns the old level', async () => {
    // Reproduces the scénario bug: command reaches Cozytouch, but Homey used to
    // fall back to on→comfort on every poll because HEATING_LEVEL was undefined.
    const { handler, capabilities } = setup({
      states: passStates({ [STATES.TARGET_HEATING_LEVEL]: 'comfort' }),
    });
    await handler.setLevel('eco');
    assert.equal(capabilities.get('cozytouch_pass_level'), 'eco');

    await handler.updateState(); // cloud still reports comfort
    assert.equal(capabilities.get('cozytouch_pass_level'), 'eco');
  });

  it('shows the cloud again once it agrees with the command', async () => {
    const { handler, capabilities, ctx } = setup({
      states: passStates({ [STATES.TARGET_HEATING_LEVEL]: 'comfort' }),
    });
    await handler.setLevel('eco');

    ctx.getDeviceState = async () => passStates({ [STATES.TARGET_HEATING_LEVEL]: 'eco' });
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_pass_level'), 'eco');
  });

  it('believes the Pass again when it never agreed', async () => {
    let now = 0;
    const { handler, capabilities } = setup({
      states: passStates({ [STATES.TARGET_HEATING_LEVEL]: 'comfort' }),
    });
    handler._writes = new PendingWrites({ now: () => now });

    await handler.setLevel('eco');
    now += SETTLE_MS - 1;
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_pass_level'), 'eco');

    now += 1;
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_pass_level'), 'comfort');
  });

  it('falls back to on/off only when no heating level state is present', async () => {
    const { handler, capabilities } = setup({
      states: [{ name: STATES.ON_OFF, value: 'on' }],
    });
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_pass_level'), 'comfort');
    assert.equal(capabilities.get('onoff'), true);
  });
});
