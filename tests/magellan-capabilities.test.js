'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const CozyTouchAPI = require('../lib/CozyTouchAPI');
const {
  capabilityIdsOf,
  describeCapabilities,
  findCapability,
  isCapabilityUnsupportedError,
  unsupportedCapabilityType,
} = require('../lib/helpers/magellan-capabilities');

const api = new CozyTouchAPI({});

// A tank reporting a capability set the app does not map reads as "no values at
// all" (reported for the AQUEO ACI HYB, productId 7). Everything below exists so
// that case is readable in a diagnostic report instead of silent.
describe('Magellan capability lookup', () => {
  it('matches an ID whatever type the API used for it', () => {
    const caps = [{ capabilityId: '7', value: '52.5' }, { capabilityId: 40, value: '55' }];
    assert.equal(api.getCapabilityValue(caps, 7), '52.5');
    assert.equal(api.getCapabilityValue(caps, 40), '55');
    assert.equal(findCapability(caps, '40').value, '55');
  });

  it('reports a missing or valueless capability as null', () => {
    const caps = [{ capabilityId: 3 }, { capabilityId: 5, value: null }];
    assert.equal(api.getCapabilityValue(caps, 3), null);
    assert.equal(api.getCapabilityValue(caps, 5), null);
    assert.equal(api.getCapabilityValue(caps, 10), null);
  });

  it('survives a payload that is not a list', () => {
    assert.equal(api.getCapabilityValue(undefined, 7), null);
    assert.equal(api.getCapabilityValue({ error: 'nope' }, 7), null);
    assert.equal(capabilityIdsOf(undefined).size, 0);
  });

  it('collects the IDs the device actually reports', () => {
    const ids = capabilityIdsOf([
      { capabilityId: '1', value: '0' },
      { capabilityId: 7, value: '52' },
      { value: 'no id' },
      null,
    ]);
    assert.deepEqual([...ids].sort((a, b) => a - b), [1, 7]);
  });
});

describe('Magellan capability dump', () => {
  it('names each ID with its value, keeping the API label when there is one', () => {
    assert.equal(
      describeCapabilities([
        { capabilityId: 7, name: 'Temperature', value: '52.5' },
        { capabilityId: 40, value: 55 },
      ]),
      '7 "Temperature"=52.5, 40=55',
    );
  });

  it('says so when the device reports nothing', () => {
    assert.equal(describeCapabilities([]), '(empty)');
    assert.equal(describeCapabilities(undefined), '(empty)');
  });

  it('truncates a long payload instead of flooding the log', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ capabilityId: i, value: i }));
    assert.equal(describeCapabilities(many, 2), '0=0, 1=1, +3');
  });
});

describe('Magellan write errors', () => {
  const apiError = (body) => Object.assign(new Error('API request failed: 404'), {
    statusCode: 404,
    body,
  });

  it('recognizes a capability the product does not implement', () => {
    const err = apiError('{"code":36002008,"message":"There is no implementation for capability Id 2 on product Id 7.","type":"NoCapabilityImplementationFound"}');
    assert.equal(unsupportedCapabilityType(err), 'NoCapabilityImplementationFound');
    assert.equal(isCapabilityUnsupportedError(err), true);
  });

  it('recognizes a capability the API does not know at all', () => {
    const err = apiError('{"code":36002005,"message":"Capability Id \'10\' not found.","type":"UnknownCapabilityId"}');
    assert.equal(unsupportedCapabilityType(err), 'UnknownCapabilityId');
    assert.equal(isCapabilityUnsupportedError(err), true);
  });

  it('leaves auth, transport and HTML error bodies alone', () => {
    const unauthorized = apiError('{"code":"900901","message":"Invalid Credentials"}');
    assert.equal(unsupportedCapabilityType(unauthorized), null);
    assert.equal(isCapabilityUnsupportedError(unauthorized), false);
    assert.equal(isCapabilityUnsupportedError(apiError('<html>502</html>')), false);
    assert.equal(isCapabilityUnsupportedError(new Error('Request timed out')), false);
    assert.equal(isCapabilityUnsupportedError(undefined), false);
  });

  it('still recognizes the error once the device has translated it', () => {
    const translated = Object.assign(new Error('This control does not exist on this device model. (capability 3)'), {
      capabilityUnsupported: true,
      statusCode: 404,
    });
    assert.equal(isCapabilityUnsupportedError(translated), true);
  });
});
