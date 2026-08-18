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

const OVERKIZ_TANK = { protocol: 'overkiz', isMbl: false };
const MBL_TANK = { protocol: 'overkiz', isMbl: true };
const MAGELLAN_TANK = { protocol: 'cozytouch', isMbl: false };

describe('water heater modes', () => {
  it('offers auto only on non-MBL Overkiz tanks', () => {
    assert.deepEqual(supportedWaterHeaterModes(OVERKIZ_TANK), ['off', 'manual', 'eco_plus', 'auto']);
    assert.deepEqual(supportedWaterHeaterModes(MBL_TANK), ['off', 'manual', 'eco_plus']);
  });

  // Magellan mode is capability 1: 0=manual, 3=eco+, 4=prog — no auto value.
  it('offers prog instead of auto on Magellan tanks', () => {
    assert.deepEqual(supportedWaterHeaterModes(MAGELLAN_TANK), ['off', 'manual', 'eco_plus', 'prog']);
  });

  it('passes supported modes through', () => {
    for (const tank of [OVERKIZ_TANK, MBL_TANK, MAGELLAN_TANK]) {
      const supported = supportedWaterHeaterModes(tank);
      for (const mode of supported) {
        assert.equal(resolveWaterHeaterMode(mode, supported, tank.isMbl), mode);
      }
    }
  });

  it('aliases auto to eco on MBL tanks only (same autoMode command)', () => {
    assert.equal(resolveWaterHeaterMode('auto', supportedWaterHeaterModes(MBL_TANK), true), 'eco_plus');
    // A Magellan tank has no auto at all: it must error, not silently do eco.
    assert.equal(resolveWaterHeaterMode('auto', supportedWaterHeaterModes(MAGELLAN_TANK), false), null);
  });

  it('rejects modes a tank has no command for', () => {
    assert.equal(resolveWaterHeaterMode('prog', supportedWaterHeaterModes(OVERKIZ_TANK), false), null);
    assert.equal(resolveWaterHeaterMode('prog', supportedWaterHeaterModes(MBL_TANK), true), null);
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
