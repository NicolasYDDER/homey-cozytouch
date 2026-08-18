'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  supportedWaterHeaterModes,
  resolveWaterHeaterMode,
} = require('../lib/helpers/water-heater-modes');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const deviceSource = fs.readFileSync(path.join(ROOT, 'lib', 'CozyTouchDevice.js'), 'utf8');

describe('water heater modes', () => {
  it('offers auto only on non-MBL tanks', () => {
    assert.deepEqual(supportedWaterHeaterModes(false), ['off', 'manual', 'eco_plus', 'auto']);
    assert.deepEqual(supportedWaterHeaterModes(true), ['off', 'manual', 'eco_plus']);
  });

  it('passes supported modes through', () => {
    const supported = supportedWaterHeaterModes(false);
    for (const mode of supported) {
      assert.equal(resolveWaterHeaterMode(mode, supported), mode);
    }
  });

  it('aliases auto to eco on MBL tanks (same autoMode command)', () => {
    assert.equal(resolveWaterHeaterMode('auto', supportedWaterHeaterModes(true)), 'eco_plus');
  });

  it('rejects modes no tank implements', () => {
    assert.equal(resolveWaterHeaterMode('prog', supportedWaterHeaterModes(false)), null);
    assert.equal(resolveWaterHeaterMode('prog', supportedWaterHeaterModes(true)), null);
  });
});

// A Flow card declared in app.json but never wired up shows in the Flow editor
// and silently does nothing — which is how the triggers stayed dead until 1.3.3.
describe('flow card wiring', () => {
  it('registers a run listener for every action', () => {
    for (const card of manifest.flow.actions) {
      assert.ok(
        appSource.includes(`getActionCard('${card.id}')`),
        `action ${card.id} has no run listener in app.js`,
      );
    }
  });

  it('registers a run listener for every condition', () => {
    for (const card of manifest.flow.conditions) {
      assert.ok(
        appSource.includes(`getConditionCard('${card.id}')`),
        `condition ${card.id} has no run listener in app.js`,
      );
    }
  });

  it('maps every trigger to a capability that fires it', () => {
    for (const card of manifest.flow.triggers) {
      assert.ok(
        deviceSource.includes(`'${card.id}'`),
        `trigger ${card.id} is never fired from CozyTouchDevice`,
      );
    }
  });

  it('gives every card a device argument and a formatted title', () => {
    const cards = [
      ...manifest.flow.triggers,
      ...manifest.flow.actions,
      ...manifest.flow.conditions,
    ];
    for (const card of cards) {
      assert.ok(card.titleFormatted, `card ${card.id} has no titleFormatted`);
      assert.ok(
        (card.args || []).some((arg) => arg.type === 'device'),
        `card ${card.id} has no device argument`,
      );
    }
  });
});
