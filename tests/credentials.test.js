'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// lib/CozyTouchDriver and lib/CozyTouchDevice require 'homey', which only
// exists on a Homey, so these guards read the sources instead. They exist to
// keep the account in one place (app settings): the Homey App Store review
// flagged the copy that used to live in every paired device's data object.
const ROOT = path.join(__dirname, '..');
const driverSource = fs.readFileSync(path.join(ROOT, 'lib', 'CozyTouchDriver.js'), 'utf8');
const deviceSource = fs.readFileSync(path.join(ROOT, 'lib', 'CozyTouchDevice.js'), 'utf8');

/** The `data: { ... }` object literals a paired device is created with. */
function pairedDeviceDataBlocks(source) {
  return [...source.matchAll(/data: \{([^}]*)\}/g)].map((match) => match[1]);
}

/** CozyTouchDevice minus _resolveCredentials, the one legacy-migration path. */
function deviceSourceOutsideMigration() {
  const start = deviceSource.indexOf('  _resolveCredentials(data) {');
  assert.notEqual(start, -1, 'expected _resolveCredentials in CozyTouchDevice');
  const end = deviceSource.indexOf('\n  }\n', start);
  return deviceSource.slice(0, start) + deviceSource.slice(end);
}

describe('credential storage', () => {
  it('never writes the account into a paired device data object', () => {
    const blocks = pairedDeviceDataBlocks(driverSource);
    assert.equal(blocks.length, 2, 'expected the Magellan and Overkiz mappers');
    for (const block of blocks) {
      assert.doesNotMatch(block, /username|password/);
    }
  });

  it('reads the account from app settings, not from device data', () => {
    assert.doesNotMatch(deviceSourceOutsideMigration(), /data\.(username|password)/);
    assert.match(deviceSource, /const \{ username, password \} = this\._credentials;/);
  });

  it('migrates a legacy device data account into app settings once', () => {
    assert.match(deviceSource, /saveCredentials\(data\.username, data\.password\)/);
  });
});
