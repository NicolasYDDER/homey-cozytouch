'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const CozyTouchAPI = require('../lib/CozyTouchAPI');
const { climateCapIds } = require('../lib/constants/cozytouch-mappings');

const CozytouchHandler = require('../drivers/climate/handlers/cozytouch');

const api = new CozyTouchAPI({});

describe('Magellan climate capability IDs per product', () => {
  // The room thermostat of an Alféa Excellia M DUO, as reported by a user's
  // gateway: modelId 557 lands on this driver via the AC range, but the product
  // answers on the towel-rack style block. Capability 7 is the mode here, which
  // is why reading it as the temperature showed a 21.97 °C room as 4 °C.
  const ROOM_0_CAPS = [
    { capabilityId: 7, value: '4' },
    { capabilityId: 17, value: '19.00000000000000000000' },
    { capabilityId: 40, value: '19.00000000000000000000' },
    { capabilityId: 73, value: '2' },
    { capabilityId: 117, value: '21.97000000000000000000' },
    { capabilityId: 153, value: '0' },
    { capabilityId: 154, value: 'Chauffage' },
    { capabilityId: 160, value: '10.0000000000000000000' },
    { capabilityId: 161, value: '35.0000000000000000000' },
    { capabilityId: 162, value: '10.0000000000000000000' },
    { capabilityId: 163, value: '35.0000000000000000000' },
    { capabilityId: 177, value: '25.0000000000000000000' },
    { capabilityId: 184, value: '0' },
    { capabilityId: 218, value: '0' },
  ];

  // ROOM_1 of an Alféa Extensa S Duo 8 (Test Connection report, app 1.4.9). Same
  // block as ROOM_0 one productId up, with one difference that matters: this
  // installation is weather-compensated and has no room probe, so it reports
  // neither 117 nor 118 — capability 7 is still the mode, and still 4.
  const ROOM_1_CAPS = [
    { capabilityId: 7, value: '4' },
    { capabilityId: 17, value: '20.0' },
    { capabilityId: 40, value: '20.0' },
    { capabilityId: 73, value: '2' },
    { capabilityId: 153, value: '0' },
    { capabilityId: 154, value: 'Pièces de vie' },
    { capabilityId: 160, value: '10.0' },
    { capabilityId: 161, value: '35.0' },
    { capabilityId: 162, value: '10.0' },
    { capabilityId: 163, value: '35.0' },
    { capabilityId: 166, value: '21' },
    { capabilityId: 177, value: '25.0' },
    { capabilityId: 181, value: '4' },
    { capabilityId: 184, value: '0' },
    { capabilityId: 192, value: '35.0' },
    { capabilityId: 218, value: '0' },
  ];

  const fakeCtx = (store, caps = ROOM_0_CAPS) => {
    const ctx = {
      writes: [],
      values: {},
      options: {},
      store,
      getCapabilities: async () => caps,
      getCapValue: (list, capId) => api.getCapabilityValue(list, capId),
      setCapValue: async (capId, value) => { ctx.writes.push([capId, value]); },
      setCapability: (name, value) => { ctx.values[name] = value; },
      setCapabilityOptions: (name, opts) => { ctx.options[name] = opts; },
      hasCapability: () => false,
      log: () => {},
    };
    return ctx;
  };

  const handlerFor = (store, caps) => {
    const ctx = fakeCtx(store, caps);
    return [new CozytouchHandler(ctx, api.getHvacModes(store.modelId)), ctx];
  };

  it('resolves the product block instead of the AC IDs', () => {
    const caps = climateCapIds(26);
    assert.equal(caps.HVAC_MODE, 7);
    assert.equal(caps.CURRENT_TEMP, 117);
    assert.equal(caps.TARGET_TEMP_HEAT, 40);
    assert.equal(caps.TARGET_TEMP_COOL, 177);
    // Not overridden: the defaults already match what the product reports.
    assert.equal(caps.MIN_TEMP_HEAT, 160);
    assert.equal(caps.MAX_TEMP_HEAT, 161);
  });

  it('gives ROOM_1 the same block with zone 2 temperature', () => {
    const caps = climateCapIds(27);
    assert.equal(caps.HVAC_MODE, 7);
    assert.equal(caps.TARGET_TEMP_HEAT, 40);
    assert.equal(caps.TARGET_TEMP_COOL, 177);
    // 117 is zone 1's probe, 118 is zone 2's.
    assert.equal(caps.CURRENT_TEMP, 118);
    assert.equal(climateCapIds(26).CURRENT_TEMP, 117);
  });

  it('keeps the default IDs for every other product', () => {
    const caps = climateCapIds(undefined);
    assert.equal(caps.HVAC_MODE, 1);
    assert.equal(caps.TARGET_TEMP_HEAT, 2);
    assert.equal(caps.CURRENT_TEMP, 7);
    assert.deepEqual(climateCapIds(99), caps);
  });

  it('reads the room temperature, not the mode enum, on productId 26', async () => {
    const [handler, ctx] = handlerFor({ productId: 26, modelId: 557 });
    await handler.updateState();

    assert.equal(ctx.values.measure_temperature, 21.97);
    // Regression: capability 7 is the mode, so 4 is what the old mapping showed.
    assert.notEqual(ctx.values.measure_temperature, 4);
  });

  it('reads setpoint, mode and range on productId 26', async () => {
    const [handler, ctx] = handlerFor({ productId: 26, modelId: 557 });
    await handler.updateState();

    assert.equal(ctx.values.target_temperature, 19);
    assert.equal(ctx.values.cozytouch_hvac_mode, 'heat');
    assert.equal(ctx.values.onoff, true);
    assert.deepEqual(ctx.options.target_temperature, { min: 10, max: 35 });
  });

  it('writes the mode to the capability the product actually has', async () => {
    const [handler, ctx] = handlerFor({ productId: 26, modelId: 557 });
    await handler.setMode('heat');

    assert.deepEqual(ctx.writes, [[7, '4']]);
  });

  it('leaves the temperature empty rather than wrong on a probeless ROOM_1', async () => {
    const [handler, ctx] = handlerFor({ productId: 27, modelId: 558 }, ROOM_1_CAPS);
    await handler.updateState();

    // Regression: on the defaults this read capability 7 and showed the mode as
    // a 4 °C room. No probe means no value — an empty tile, not a wrong one.
    assert.equal(ctx.values.measure_temperature, undefined);
    assert.equal(ctx.values.target_temperature, 20);
    assert.equal(ctx.values.cozytouch_hvac_mode, 'heat');
    assert.equal(ctx.values.onoff, true);
  });

  it('still reads zone 2 temperature when the probe is there', async () => {
    const withProbe = [...ROOM_1_CAPS, { capabilityId: 118, value: '20.84000000000000000000' }];
    const [handler, ctx] = handlerFor({ productId: 27, modelId: 558 }, withProbe);
    await handler.updateState();

    assert.equal(ctx.values.measure_temperature, 20.84);
  });

  it('leaves a real air conditioner on the default IDs', async () => {
    const [handler, ctx] = handlerFor({ productId: 99, modelId: 558 });
    await handler.updateState();

    // Capability 7 is the current temperature for the products this block was
    // built from, so the payload above reads back as 4 there — unchanged.
    assert.equal(ctx.values.measure_temperature, 4);
  });
});
