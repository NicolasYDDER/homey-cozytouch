'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const PassApcHandler = require('../drivers/water_heater/handlers/overkiz-pass-apc');
const {
  activeSetpoint,
  describeTankSchedule,
  passApcDhwCapabilities,
  passApcDhwHasAway,
} = require('../lib/helpers/pass-apc-dhw');
const {
  supportedWaterHeaterModes,
  resolveWaterHeaterMode,
} = require('../lib/helpers/water-heater-modes');
const { describeOverkizAccount, MAX_COMMANDS } = require('../lib/helpers/discovery-report');

// What the tank of an Alféa Extensa Duo A.I. 5 R32 reports (Test Connection,
// app 1.4.11, `IO (…#2)` / io:AtlanticPassAPCDHWComponent). Note what is absent:
// no tank temperature, no absence state.
const states = (overrides = {}) => {
  const base = {
    'core:CommandLockLevelsState': [],
    'core:StatusState': 'available',
    'io:PassAPCDHWConfigurationState': 'cumulated',
    'io:PassAPCDHWModeState': 'peakAndOffPeakScheduling',
    'io:PassAPCDHWProfileState': 'eco',
    'core:ComfortTargetDHWTemperatureState': 52,
    'core:EcoTargetDHWTemperatureState': 40,
    'core:TargetDHWTemperatureState': 40,
    'core:DHWDerogationAvailabilityState': 'available',
    'core:BoostOnOffState': 'off',
    'core:DHWOnOffState': 'on',
  };
  return Object.entries({ ...base, ...overrides })
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({ name, value }));
};

// The report did not list this tank's commands. These are the ones Home Assistant
// drives a Pass APC tank with, which is the closest thing to ground truth.
const COMMANDS = [
  'setDHWOnOffState',
  'setBoostOnOffState',
  'setEcoTargetDHWTemperature',
  'setComfortTargetDHWTemperature',
  'refreshEcoTargetDHWTemperature',
  'refreshComfortTargetDHWTemperature',
  'refreshTargetDHWTemperature',
  'setPassAPCDHWMode',
];

const fakeCtx = ({ tankStates = states(), commands = COMMANDS, failing = {} } = {}) => {
  const ctx = {
    sent: [],
    values: {},
    logs: [],
    store: { overkizCommands: commands },
    getDeviceState: async () => tankStates,
    executeCommand: async (name, params) => {
      ctx.sent.push([name, params]);
      if (failing[name]) throw failing[name];
    },
    setCapability: (name, value) => { ctx.values[name] = value; },
    log: (line) => ctx.logs.push(line),
  };
  return ctx;
};

describe('Pass APC tank — reading', () => {
  it('shows the setpoint, boost and on/off the tank reports', async () => {
    const ctx = fakeCtx();
    await new PassApcHandler(ctx).updateState();

    assert.equal(ctx.values.target_temperature, 40);
    assert.equal(ctx.values.cozytouch_boost, false);
    assert.equal(ctx.values.cozytouch_heating_mode, 'auto');
  });

  it('invents no tank temperature and no away state the tank does not report', async () => {
    const ctx = fakeCtx();
    await new PassApcHandler(ctx).updateState();

    assert.equal('measure_temperature' in ctx.values, false);
    assert.equal('cozytouch_away_mode' in ctx.values, false);
  });

  it('shows Off while the tank is switched off', async () => {
    const ctx = fakeCtx({ tankStates: states({ 'core:DHWOnOffState': 'off' }) });
    await new PassApcHandler(ctx).updateState();
    assert.equal(ctx.values.cozytouch_heating_mode, 'off');
  });

  it('shows boost while it runs', async () => {
    const ctx = fakeCtx({ tankStates: states({ 'core:BoostOnOffState': 'on' }) });
    await new PassApcHandler(ctx).updateState();
    assert.equal(ctx.values.cozytouch_boost, true);
  });

  it('does not guess a mode when the tank does not say whether it is on', async () => {
    const ctx = fakeCtx({ tankStates: states({ 'core:DHWOnOffState': undefined }) });
    await new PassApcHandler(ctx).updateState();
    assert.equal('cozytouch_heating_mode' in ctx.values, false);
  });

  // The mode, profile and configuration have no tile: the log is the only place
  // they appear, and the scheduling mode used to be dropped without a word.
  it('writes the schedule to the log once, and again only when it changes', async () => {
    const ctx = fakeCtx();
    const handler = new PassApcHandler(ctx);

    await handler.updateState();
    assert.equal(ctx.logs.length, 1);
    assert.match(ctx.logs[0], /mode "peakAndOffPeakScheduling", profile "eco", configuration "cumulated"/);

    await handler.updateState();
    assert.equal(ctx.logs.length, 1, 'repeated the same line on every poll');

    ctx.getDeviceState = async () => states({ 'io:PassAPCDHWProfileState': 'comfort' });
    await handler.updateState();
    assert.equal(ctx.logs.length, 2);
    assert.match(ctx.logs[1], /profile "comfort"/);
  });

  it('logs nothing when the tank reports no schedule at all', async () => {
    const ctx = fakeCtx({
      tankStates: states({
        'io:PassAPCDHWModeState': undefined,
        'io:PassAPCDHWProfileState': undefined,
        'io:PassAPCDHWConfigurationState': undefined,
      }),
    });
    await new PassApcHandler(ctx).updateState();
    assert.equal(ctx.logs.length, 0);
  });
});

describe('Pass APC tank — which setpoint the tile stands for', () => {
  it('is the eco one in eco profile, the comfort one otherwise', () => {
    assert.equal(activeSetpoint(states()), 'eco');
    assert.equal(activeSetpoint(states({ 'io:PassAPCDHWProfileState': 'comfort' })), 'comfort');
    assert.equal(activeSetpoint(states({ 'io:PassAPCDHWProfileState': undefined })), 'comfort');
  });

  it('is always comfort while boost runs', () => {
    assert.equal(activeSetpoint(states({ 'core:BoostOnOffState': 'on' })), 'comfort');
  });

  it('also honours an eco mode state, which is what Home Assistant keys on', () => {
    assert.equal(activeSetpoint(states({
      'io:PassAPCDHWProfileState': undefined,
      'io:PassAPCDHWModeState': 'eco',
    })), 'eco');
  });

  it('describes the schedule, and nothing when there is none', () => {
    assert.equal(
      describeTankSchedule(states()),
      'mode "peakAndOffPeakScheduling", profile "eco", configuration "cumulated"',
    );
    assert.equal(describeTankSchedule([]), null);
  });
});

describe('Pass APC tank — writing the setpoint', () => {
  // In eco profile the tile shows the eco setpoint (40). A write to the comfort
  // setter would change the 52 instead and the slider would snap back.
  it('writes the eco setpoint in eco profile, then asks the tank to republish it', async () => {
    const ctx = fakeCtx();
    await new PassApcHandler(ctx).setTargetTemperature(42);

    assert.deepEqual(ctx.sent, [
      ['setEcoTargetDHWTemperature', [42]],
      ['refreshEcoTargetDHWTemperature', []],
      ['refreshTargetDHWTemperature', []],
    ]);
  });

  it('writes the comfort setpoint outside eco profile', async () => {
    const ctx = fakeCtx({ tankStates: states({ 'io:PassAPCDHWProfileState': 'comfort' }) });
    await new PassApcHandler(ctx).setTargetTemperature(55);

    assert.deepEqual(ctx.sent, [
      ['setComfortTargetDHWTemperature', [55]],
      ['refreshComfortTargetDHWTemperature', []],
      ['refreshTargetDHWTemperature', []],
    ]);
  });

  it('writes the comfort setpoint during boost even in eco profile', async () => {
    const ctx = fakeCtx({ tankStates: states({ 'core:BoostOnOffState': 'on' }) });
    await new PassApcHandler(ctx).setTargetTemperature(55);
    assert.equal(ctx.sent[0][0], 'setComfortTargetDHWTemperature');
  });

  it('falls back to the generic setter when the profile setter is not advertised', async () => {
    const ctx = fakeCtx({ commands: ['setTargetDHWTemperature', 'setDHWOnOffState'] });
    await new PassApcHandler(ctx).setTargetTemperature(45);
    assert.deepEqual(ctx.sent, [['setTargetDHWTemperature', [45]]]);
  });

  it('says so, and sends nothing, when the tank accepts no setpoint command', async () => {
    const ctx = fakeCtx({ commands: ['setDHWOnOffState'] });
    await assert.rejects(
      () => new PassApcHandler(ctx).setTargetTemperature(45),
      /accepts none of these commands: setEcoTargetDHWTemperature/,
    );
    assert.deepEqual(ctx.sent, []);
  });

  it('sends only the refreshes the tank advertises', async () => {
    const ctx = fakeCtx({ commands: ['setEcoTargetDHWTemperature', 'refreshTargetDHWTemperature'] });
    await new PassApcHandler(ctx).setTargetTemperature(42);
    assert.deepEqual(ctx.sent.map(([name]) => name), [
      'setEcoTargetDHWTemperature',
      'refreshTargetDHWTemperature',
    ]);
  });

  it('does not report a refresh the tank declines as a failed write', async () => {
    const ctx = fakeCtx({ failing: { refreshEcoTargetDHWTemperature: new Error('refused') } });
    await new PassApcHandler(ctx).setTargetTemperature(42);

    assert.deepEqual(ctx.sent.map(([name]) => name), [
      'setEcoTargetDHWTemperature',
      'refreshEcoTargetDHWTemperature',
      'refreshTargetDHWTemperature',
    ]);
    assert.match(ctx.logs.join('\n'), /refreshEcoTargetDHWTemperature failed \(the setpoint itself was sent\)/);
  });

  it('still reports a failed setpoint write', async () => {
    const ctx = fakeCtx({ failing: { setEcoTargetDHWTemperature: new Error('API 500') } });
    await assert.rejects(() => new PassApcHandler(ctx).setTargetTemperature(42), /API 500/);
  });

  // Devices paired before the commands were stored have no list to pick from:
  // the first candidate goes out, and no refresh is guessed at.
  it('uses the profile setter and no refresh when the tank advertised nothing', async () => {
    const ctx = fakeCtx({ commands: [] });
    await new PassApcHandler(ctx).setTargetTemperature(42);
    assert.deepEqual(ctx.sent, [['setEcoTargetDHWTemperature', [42]]]);
  });
});

describe('Pass APC tank — on/off and boost', () => {
  it('switches off with the on/off command alone', async () => {
    const ctx = fakeCtx();
    await new PassApcHandler(ctx).setMode('off');
    assert.deepEqual(ctx.sent, [['setDHWOnOffState', ['off']]]);
    assert.equal(ctx.values.cozytouch_heating_mode, 'off');
  });

  it('switches on for Auto and leaves the schedule alone', async () => {
    const ctx = fakeCtx();
    await new PassApcHandler(ctx).setMode('auto');
    assert.deepEqual(ctx.sent, [['setDHWOnOffState', ['on']]]);
    assert.equal(ctx.values.cozytouch_heating_mode, 'auto');
  });

  it('never sends the scheduling command, whose values nothing shows this tank takes', async () => {
    const ctx = fakeCtx();
    const handler = new PassApcHandler(ctx);
    await handler.setMode('auto');
    await handler.setMode('off');
    assert.equal(ctx.sent.some(([name]) => name === 'setPassAPCDHWMode'), false);
  });

  it('refuses a mode the tank does not have rather than sending a guess', async () => {
    for (const mode of ['manual', 'eco_plus', 'prog']) {
      const ctx = fakeCtx();
      await assert.rejects(() => new PassApcHandler(ctx).setMode(mode), /Unsupported water heater mode/);
      assert.deepEqual(ctx.sent, [], `sent a command for ${mode}`);
    }
  });

  it('treats Auto as already true on a tank with no on/off command', async () => {
    const ctx = fakeCtx({ commands: ['setBoostOnOffState'] });
    await new PassApcHandler(ctx).setMode('auto');
    assert.deepEqual(ctx.sent, []);
    assert.equal(ctx.values.cozytouch_heating_mode, 'auto');
  });

  it('cannot be switched off without an on/off command, and says so', async () => {
    const ctx = fakeCtx({ commands: ['setBoostOnOffState'] });
    await assert.rejects(() => new PassApcHandler(ctx).setMode('off'), /setDHWOnOffState/);
  });

  it('writes boost', async () => {
    const ctx = fakeCtx();
    const handler = new PassApcHandler(ctx);
    await handler.setBoost(true);
    await handler.setBoost(false);
    assert.deepEqual(ctx.sent, [['setBoostOnOffState', ['on']], ['setBoostOnOffState', ['off']]]);
  });

  it('has no away control to drive, and says so', async () => {
    const ctx = fakeCtx();
    await assert.rejects(() => new PassApcHandler(ctx).setAwayMode(true), /accepts none of these commands/);
    assert.deepEqual(ctx.sent, []);
  });
});

describe('Pass APC tank — what pairing offers', () => {
  const dev = (extra = {}) => ({
    controllableName: 'io:AtlanticPassAPCDHWComponent',
    widget: 'AtlanticPassAPCDHW',
    uiClass: 'WaterHeatingSystem',
    states: states(),
    definition: { commands: COMMANDS.map((commandName) => ({ commandName, nparams: 1 })) },
    ...extra,
  });

  // The Extensa Duo A.I. report: no tank temperature, no absence command.
  it('offers neither a temperature nor an away toggle the tank cannot back', () => {
    assert.deepEqual(passApcDhwCapabilities(dev()), ['target_temperature', 'cozytouch_heating_mode']);
  });

  it('offers a temperature when the tank publishes one', () => {
    const withTemp = dev({ states: states({ 'core:DHWTemperatureState': 48.5 }) });
    assert.deepEqual(
      passApcDhwCapabilities(withTemp),
      ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode'],
    );
  });

  it('offers away when the tank advertises an absence command', () => {
    const withAbsence = dev({
      definition: { commands: [{ commandName: 'setDHWOnOffState' }, { commandName: 'setAbsenceMode' }] },
    });
    assert.deepEqual(
      passApcDhwCapabilities(withAbsence),
      ['target_temperature', 'cozytouch_heating_mode', 'cozytouch_away_mode'],
    );
  });

  it('does not offer away for a state it could only read', () => {
    const readOnly = dev({ states: states({ 'core:DHWAbsenceModeState': 'off' }) });
    assert.equal(passApcDhwCapabilities(readOnly).includes('cozytouch_away_mode'), false);
  });

  it('gives a tank that reported no states the benefit of the doubt on temperature', () => {
    assert.equal(passApcDhwCapabilities(dev({ states: [] })).includes('measure_temperature'), true);
    assert.equal(passApcDhwCapabilities({}).includes('measure_temperature'), true);
  });

  // Not knowing is not the same as not having: a tank paired before commands
  // were stored must keep the tile it already has.
  it('tells "has no away command" from "advertised no commands"', () => {
    assert.equal(passApcDhwHasAway(['setDHWOnOffState']), false);
    assert.equal(passApcDhwHasAway(['setAbsenceMode']), true);
    assert.equal(passApcDhwHasAway([]), null);
    assert.equal(passApcDhwHasAway(undefined), null);
  });
});

describe('Pass APC tank — mode picker', () => {
  const ctx = { protocol: 'overkiz', isPassApc: true };

  it('offers Off and Auto, which is all the tank has', () => {
    assert.deepEqual(supportedWaterHeaterModes(ctx), ['off', 'auto']);
  });

  it('offers Auto alone when the tank cannot be switched off', () => {
    assert.deepEqual(supportedWaterHeaterModes({ ...ctx, hasOnOff: false }), ['auto']);
  });

  it('leaves the other tanks exactly as they were', () => {
    assert.deepEqual(supportedWaterHeaterModes({ protocol: 'overkiz' }), ['off', 'manual', 'eco_plus', 'auto']);
    assert.deepEqual(supportedWaterHeaterModes({ protocol: 'cozytouch' }), ['off', 'manual', 'eco_plus', 'prog']);
    // The flag means nothing on Magellan, whose tanks are never Pass APC.
    assert.deepEqual(
      supportedWaterHeaterModes({ protocol: 'cozytouch', isPassApc: true }),
      ['off', 'manual', 'eco_plus', 'prog'],
    );
  });

  it('refuses the Flow card modes the tank has no command for', () => {
    const supported = supportedWaterHeaterModes(ctx);
    assert.equal(resolveWaterHeaterMode('manual', supported), null);
    assert.equal(resolveWaterHeaterMode('eco_plus', supported), null);
    assert.equal(resolveWaterHeaterMode('auto', supported), 'auto');
    assert.equal(resolveWaterHeaterMode('off', supported), 'off');
  });
});

describe('Overkiz report — accepted commands', () => {
  const typeOf = () => 'WATER_HEATER';
  const tank = (commandNames) => ({
    label: 'IO (…#2)',
    controllableName: 'io:AtlanticPassAPCDHWComponent',
    uiClass: 'WaterHeatingSystem',
    widget: 'AtlanticPassAPCDHW',
    deviceURL: 'io://1234-5678-9012/8912345#2',
    states: states(),
    definition: { commands: commandNames.map((commandName) => ({ commandName, nparams: 1 })) },
  });

  it('lists what the device can be told, after what it reports', () => {
    const report = describeOverkizAccount([tank(['setDHWOnOffState', 'setBoostOnOffState'])], typeOf);
    const lines = report.split('\n');
    const stateLine = lines.findIndex((line) => line.includes('core:DHWOnOffState=on'));
    assert.ok(stateLine >= 0);
    assert.equal(lines[stateLine + 1], '  commands: setDHWOnOffState, setBoostOnOffState');
  });

  it('prints the commands even for a device that reports no states', () => {
    const bare = { ...tank(['on', 'off']), states: [] };
    const report = describeOverkizAccount([bare], typeOf);
    assert.match(report, /\(no states\)\n {2}commands: on, off/);
  });

  it('says nothing about commands a device does not advertise', () => {
    const report = describeOverkizAccount([{ ...tank([]), definition: undefined }], typeOf);
    assert.equal(report.includes('commands:'), false);
  });

  it('caps a very long command list', () => {
    const many = Array.from({ length: MAX_COMMANDS + 5 }, (_, i) => `cmd${i}`);
    const report = describeOverkizAccount([tank(many)], typeOf);
    assert.match(report, new RegExp(`cmd${MAX_COMMANDS - 1}, \\+5$`, 'm'));
    assert.equal(report.includes(`cmd${MAX_COMMANDS},`), false, 'printed past the cap');
  });
});
