'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const AdjustableSetpointOverkizHandler = require('../drivers/heater/handlers/overkiz-adjustable-setpoint');
const { PendingWrites, SETTLE_MS } = require('../lib/helpers/pending-writes');
const { isElectricEnergySensor } = require('../lib/helpers/overkiz-device');
const { PASS_COZYTOUCH_LEVELS } = require('../lib/constants/overkiz-mappings');
const { UnsupportedModeError } = AdjustableSetpointOverkizHandler;
const {
  ScheduleError,
  resolveDays,
  parsePeriods,
  applyPeriods,
} = require('../lib/helpers/time-program');

/**
 * An Ipala stack as a Cozytouch account lists it (pyoverkiz test fixture
 * setup_cozytouch_3: Sauter IPALA H BLC, 1000 W): the radiator on #1, its
 * temperature probe on #2 and the energy counter on #5.
 */
const STACK = 'io://1234-1234-9591/11984440';

const DEVICES = [
  {
    deviceURL: `${STACK}#1`,
    controllableName: 'io:AtlanticElectricalHeaterWithAdjustableTemperatureSetpointIOComponent',
    widget: 'AtlanticElectricalHeaterWithAdjustableTemperatureSetpoint',
  },
  {
    deviceURL: `${STACK}#2`,
    controllableName: 'io:TemperatureInCelciusIOSystemDeviceSensor',
    widget: 'TemperatureSensor',
  },
  {
    deviceURL: `${STACK}#5`,
    controllableName: 'io:CumulatedElectricalEnergyConsumptionIOSystemDeviceSensor',
    widget: 'CumulativeElectricPowerConsumptionSensor',
  },
];

const TIME_PROGRAM = [
  { monday: [{ start: '05:00', end: '09:00' }, { start: '17:00', end: '23:00' }, { start: '00:00', end: '00:00' }] },
  { tuesday: [{ start: '05:00', end: '09:00' }, { start: '17:00', end: '23:00' }, { start: '00:00', end: '00:00' }] },
  { wednesday: [{ start: '05:00', end: '09:00' }, { start: '17:00', end: '23:00' }, { start: '00:00', end: '00:00' }] },
  { thursday: [{ start: '05:00', end: '09:00' }, { start: '17:00', end: '23:00' }, { start: '00:00', end: '00:00' }] },
  { friday: [{ start: '05:00', end: '09:00' }, { start: '17:00', end: '23:00' }, { start: '00:00', end: '00:00' }] },
  { saturday: [{ start: '05:00', end: '23:00' }, { start: '00:00', end: '00:00' }, { start: '00:00', end: '00:00' }] },
  { sunday: [{ start: '05:00', end: '23:00' }, { start: '00:00', end: '00:00' }, { start: '00:00', end: '00:00' }] },
];

function radiatorStates(overrides = {}) {
  const base = {
    'core:OnOffState': 'on',
    'io:TargetHeatingLevelState': 'comfort',
    'core:OperatingModeState': 'internal',
    'core:TargetTemperatureState': 19,
    'core:MaximumHeatingTargetTemperatureState': 28,
    'io:PowerState': 1000,
    'io:CurrentWorkingRateState': 50,
    'core:TimeProgramState': TIME_PROGRAM,
  };
  return Object.entries({ ...base, ...overrides })
    .map(([name, value]) => ({ name, value }));
}

/**
 * A handler wired to recording stubs. `states` answers the radiator, `sensors`
 * answers the other endpoints by URL; `commands` is the store's command list.
 */
function setup({ states = radiatorStates(), sensors = {}, devices = DEVICES, commands = [] } = {}) {
  const capabilities = new Map();
  const calls = { executed: [], options: [], added: [], logs: [] };

  const ctx = {
    deviceURL: `${STACK}#1`,
    store: { overkizCommands: commands },
    log: (...args) => calls.logs.push(args.join(' ')),
    setCapability: (name, value) => capabilities.set(name, value),
    setCapabilityOptions: (name, opts) => calls.options.push([name, opts]),
    ensureCapability: async (name) => {
      calls.added.push(name);
      return true;
    },
    getDeviceState: async () => states,
    executeCommand: async (name, params) => calls.executed.push([name, params]),
    api: {
      getDevices: async () => devices,
      getDeviceState: async (url) => {
        if (!(url in sensors)) throw new Error(`no such endpoint ${url}`);
        return sensors[url];
      },
    },
  };

  return { handler: new AdjustableSetpointOverkizHandler(ctx), capabilities, calls };
}

const SENSORS = {
  [`${STACK}#2`]: [{ name: 'core:TemperatureState', value: 15.4 }],
  [`${STACK}#5`]: [{ name: 'core:ElectricEnergyConsumptionState', value: 728000 }],
};

describe('Ipala energy', () => {
  it('finds the counter endpoint by what it is, not by its index', () => {
    assert.equal(isElectricEnergySensor(DEVICES[2]), true);
    assert.equal(isElectricEnergySensor(DEVICES[1]), false);
    assert.equal(isElectricEnergySensor(DEVICES[0]), false);
    // The heat pump's counter is a different component of the same widget
    assert.equal(isElectricEnergySensor({
      controllableName: 'io:TotalElectricalEnergyConsumptionSensor',
      widget: 'CumulativeElectricPowerConsumptionSensor',
    }), true);
  });

  it('reports the counter in kWh', async () => {
    const { handler, capabilities, calls } = setup({ sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.get('meter_power'), 728);
    assert.ok(calls.added.includes('meter_power'));
  });

  it('estimates the power from the rating and the share of time the element is on', async () => {
    const { handler, capabilities, calls } = setup({ sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.get('measure_power'), 500);
    assert.deepEqual(calls.options.find(([name]) => name === 'measure_power'), [
      'measure_power',
      { isApproximated: true },
    ]);
  });

  it('reports 0 W while the radiator is off, whatever its working rate says', async () => {
    // A dump of a radiator in standby still read io:CurrentWorkingRateState 100
    const states = radiatorStates({
      'core:OperatingModeState': 'standby',
      'io:TargetHeatingLevelState': 'off',
      'io:CurrentWorkingRateState': 100,
    });
    const { handler, capabilities } = setup({ states, sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.get('measure_power'), 0);
  });

  it('clamps a working rate outside 0-100', async () => {
    const states = radiatorStates({ 'io:CurrentWorkingRateState': 140 });
    const { handler, capabilities } = setup({ states, sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.get('measure_power'), 1000);
  });

  it('adds no energy tile for a radiator that reports none of it', async () => {
    const states = radiatorStates({ 'io:PowerState': null, 'io:CurrentWorkingRateState': null });
    const bare = DEVICES.filter((dev) => !isElectricEnergySensor(dev));
    const { handler, capabilities, calls } = setup({ states, devices: bare, sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.has('measure_power'), false);
    assert.equal(capabilities.has('meter_power'), false);
    assert.deepEqual(calls.added.filter((name) => name !== 'cozytouch_heating_level'), []);
  });

  it('keeps polling when the counter cannot be read', async () => {
    const { handler, capabilities } = setup({
      sensors: { [`${STACK}#2`]: SENSORS[`${STACK}#2`] },
    });
    await handler.updateState();

    assert.equal(capabilities.has('meter_power'), false);
    assert.equal(capabilities.get('measure_temperature'), 15.4);
    assert.equal(capabilities.get('measure_power'), 500);
  });

  it('retries the counter lookup after a failed one, but not after "none"', async () => {
    let lookups = 0;
    const { handler, calls } = setup({ sensors: SENSORS });
    handler.ctx.api.getDevices = async () => {
      lookups += 1;
      if (lookups === 1) throw new Error('network down');
      return DEVICES;
    };

    await handler.updateState();
    assert.equal(calls.added.includes('meter_power'), false);
    await handler.updateState();
    assert.equal(calls.added.includes('meter_power'), true);
    await handler.updateState();
    assert.equal(lookups, 2);
  });
});

describe('Ipala active level', () => {
  it('shows the level the radiator is applying', async () => {
    const { handler, capabilities, calls } = setup({ sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.get('cozytouch_heating_level'), 'comfort');
    assert.ok(calls.added.includes('cozytouch_heating_level'));
  });

  it('tells a programmed radiator\'s eco period from its comfort period', async () => {
    const states = radiatorStates({ 'io:TargetHeatingLevelState': 'eco' });
    const { handler, capabilities } = setup({ states, sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.get('cozytouch_heating_level'), 'eco');
    // ...and the radiator is still in its program: eco is where a programmed
    // radiator spends most of the day, not a different mode (it used to read
    // "manual" there, so Program could never be seen on a tile)
    assert.equal(capabilities.get('cozytouch_heating_mode'), 'prog');
    assert.equal(capabilities.get('onoff'), true);
  });

  it('keeps a manual radiator manual whatever level it is at', async () => {
    const states = radiatorStates({
      'core:OperatingModeState': 'basic',
      'io:TargetHeatingLevelState': 'eco',
    });
    const { handler, capabilities } = setup({ states, sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.get('cozytouch_heating_mode'), 'manual');
    assert.equal(capabilities.get('onoff'), true);
  });

  it('reads a radiator in standby as off even when its level is still eco', async () => {
    const states = radiatorStates({
      'core:OperatingModeState': 'standby',
      'io:TargetHeatingLevelState': 'eco',
    });
    const { handler, capabilities } = setup({ states, sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.get('cozytouch_heating_mode'), 'off');
    assert.equal(capabilities.get('onoff'), false);
    assert.equal(capabilities.get('measure_power'), 0);
  });

  it('falls back to the on/off state when no operating mode is reported', async () => {
    for (const [onOff, mode] of [['on', 'manual'], ['off', 'off']]) {
      const states = radiatorStates({ 'core:OperatingModeState': null, 'core:OnOffState': onOff });
      const { handler, capabilities } = setup({ states, sensors: SENSORS });
      await handler.updateState();

      assert.equal(capabilities.get('cozytouch_heating_mode'), mode, onOff);
      assert.equal(capabilities.get('onoff'), onOff === 'on', onOff);
    }
  });

  it('says once which operating mode the radiator reports', async () => {
    const { handler, calls } = setup({ sensors: SENSORS });
    await handler.updateState();
    await handler.updateState();

    const lines = calls.logs.filter((line) => line.includes('Operating mode reported'));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /"internal"/);
  });

  it('leaves the tile alone on a level it has no value for', async () => {
    const states = radiatorStates({ 'io:TargetHeatingLevelState': 'boost' });
    const { handler, capabilities, calls } = setup({ states, sensors: SENSORS });
    await handler.updateState();
    await handler.updateState();

    assert.equal(capabilities.has('cozytouch_heating_level'), false);
    // Said once, so a diagnostic report names the value without a line per poll
    assert.equal(calls.logs.filter((line) => line.includes('"boost"')).length, 1);
  });

  it('does not change how the mode is read', async () => {
    const { handler, capabilities } = setup({ sensors: SENSORS });
    await handler.updateState();

    assert.equal(capabilities.get('cozytouch_heating_mode'), 'prog');
    assert.equal(capabilities.get('onoff'), true);
    assert.equal(capabilities.get('target_temperature'), 19);
  });
});

describe('Ipala commands and the cloud catching up', () => {
  const OFF = { 'core:OperatingModeState': 'standby', 'io:TargetHeatingLevelState': 'off' };

  /** The radiator the cloud still describes as it was before the command. */
  const staleStates = () => radiatorStates({ 'core:OperatingModeState': 'basic', 'io:TargetHeatingLevelState': 'comfort' });

  it('keeps a radiator switched off off while the cloud still reports the old state', async () => {
    // The log of the report: off at 22:26:28, "manual" again at :33, "off" at 22:27:33
    const { handler, capabilities } = setup({ states: staleStates(), sensors: SENSORS });
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_heating_mode'), 'manual');

    await handler.setOnOff(false);
    assert.equal(capabilities.get('cozytouch_heating_mode'), 'off');
    assert.equal(capabilities.get('onoff'), false);

    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_heating_mode'), 'off');
    assert.equal(capabilities.get('onoff'), false);
  });

  it('shows the cloud again once it agrees with the command', async () => {
    const { handler, capabilities } = setup({ states: staleStates(), sensors: SENSORS });
    await handler.setOnOff(false);

    handler.ctx.getDeviceState = async () => radiatorStates(OFF);
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_heating_mode'), 'off');

    // The wait is over: a later change made elsewhere is a change like any other
    handler.ctx.getDeviceState = async () => staleStates();
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_heating_mode'), 'manual');
    assert.equal(capabilities.get('onoff'), true);
  });

  it('believes the radiator again when it never agreed', async () => {
    let now = 0;
    const { handler, capabilities } = setup({ states: staleStates(), sensors: SENSORS });
    handler._writes = new PendingWrites({ now: () => now });

    await handler.setMode('off');
    now += SETTLE_MS - 1;
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_heating_mode'), 'off');

    now += 1;
    await handler.updateState();
    assert.equal(capabilities.get('cozytouch_heating_mode'), 'manual');
  });

  it('holds a setpoint just sent against a stale one', async () => {
    const { handler, capabilities } = setup({ sensors: SENSORS });
    await handler.updateState();
    assert.equal(capabilities.get('target_temperature'), 19);

    await handler.setTargetTemperature(20.5);
    capabilities.set('target_temperature', 20.5); // Homey stores what the tile was set to
    await handler.updateState();
    assert.equal(capabilities.get('target_temperature'), 20.5);

    handler.ctx.getDeviceState = async () => radiatorStates({ 'core:TargetTemperatureState': 20.5 });
    await handler.updateState();
    assert.equal(capabilities.get('target_temperature'), 20.5);
  });

  it('sends the commands the radiator accepts for each mode', async () => {
    const { handler, calls } = setup();
    await handler.setMode('prog');
    await handler.setMode('manual');
    await handler.setOnOff(false);
    await handler.setTargetTemperature(21);

    assert.deepEqual(calls.executed, [
      ['setOperatingMode', ['internal']],
      ['setOperatingMode', ['basic']],
      ['setOperatingMode', ['standby']],
      ['setTargetTemperature', [21]],
    ]);
  });

  it('does not wait for a mode the radiator never reports back as its mode', async () => {
    // Eco+ is a level, set with setHeatingLevel; the mode stays what it was
    const { handler, capabilities } = setup({ states: staleStates(), sensors: SENSORS });
    await handler.setMode('eco_plus');
    await handler.updateState();

    assert.equal(capabilities.get('cozytouch_heating_mode'), 'manual');
  });

  it('refuses a mode it has no command for, and sends nothing', async () => {
    const { handler, calls } = setup();
    await assert.rejects(() => handler.setMode('auto'), UnsupportedModeError);
    assert.equal(calls.executed.length, 0);
  });
});

describe('time program parsing', () => {
  it('expands day groups', () => {
    assert.deepEqual(resolveDays('monday'), ['monday']);
    assert.deepEqual(resolveDays('weekdays'), ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
    assert.deepEqual(resolveDays('weekend'), ['saturday', 'sunday']);
    assert.equal(resolveDays('all').length, 7);
    assert.throws(() => resolveDays('someday'), ScheduleError);
  });

  it('reads periods, earliest first', () => {
    assert.deepEqual(parsePeriods('17:00-22:00, 6:30-08:00'), [
      { start: '06:30', end: '08:00' },
      { start: '17:00', end: '22:00' },
    ]);
    assert.deepEqual(parsePeriods('06:00 – 08:00; 18:00-22:30'), [
      { start: '06:00', end: '08:00' },
      { start: '18:00', end: '22:30' },
    ]);
  });

  it('reads nothing as eco all day', () => {
    for (const none of ['', '   ', 'none', 'None', '-', undefined, null]) {
      assert.deepEqual(parsePeriods(none), [], JSON.stringify(none));
    }
  });

  it('refuses what the radiator cannot hold', () => {
    assert.throws(() => parsePeriods('06:45-08:00'), /half hour/);
    assert.throws(() => parsePeriods('25:00-26:00'), /time of day/);
    assert.throws(() => parsePeriods('08:00-06:00'), /ends before/);
    assert.throws(() => parsePeriods('22:00-00:00'), /ends before/);
    assert.throws(() => parsePeriods('08:00-08:00'), /ends before/);
    assert.throws(() => parsePeriods('06:00-09:00, 08:00-10:00'), /overlaps/);
    assert.throws(() => parsePeriods('breakfast'), /not a period/);
    assert.throws(() => parsePeriods('06:00-08:00,'), /not a period/);
  });

  it('allows periods that touch', () => {
    assert.equal(parsePeriods('06:00-08:00, 08:00-10:00').length, 2);
  });
});

describe('time program rewriting', () => {
  it('replaces the days asked for and nothing else', () => {
    const next = applyPeriods(TIME_PROGRAM, ['monday'], parsePeriods('06:30-08:00'));

    assert.deepEqual(next[0], {
      monday: [
        { start: '06:30', end: '08:00' },
        { start: '00:00', end: '00:00' },
        { start: '00:00', end: '00:00' },
      ],
    });
    assert.deepEqual(next.slice(1), TIME_PROGRAM.slice(1));
    // The program it was given is not modified
    assert.equal(TIME_PROGRAM[0].monday[0].start, '05:00');
  });

  it('writes several days in one program', () => {
    const next = applyPeriods(TIME_PROGRAM, resolveDays('weekend'), parsePeriods('08:00-12:00, 14:00-22:00'));

    assert.deepEqual(next[5].saturday.slice(0, 2), [
      { start: '08:00', end: '12:00' },
      { start: '14:00', end: '22:00' },
    ]);
    assert.deepEqual(next[5].saturday, next[6].sunday);
    assert.deepEqual(next.slice(0, 5), TIME_PROGRAM.slice(0, 5));
  });

  it('clears a day with no periods', () => {
    const next = applyPeriods(TIME_PROGRAM, ['friday'], []);
    assert.ok(next[4].friday.every((w) => w.start === '00:00' && w.end === '00:00'));
    assert.equal(next[4].friday.length, 3);
  });

  it('keeps the number of slots the radiator reported', () => {
    const twoSlots = [{ monday: [{ start: '05:00', end: '09:00' }, { start: '00:00', end: '00:00' }] }];
    assert.equal(applyPeriods(twoSlots, ['monday'], []).length, 1);
    assert.throws(
      () => applyPeriods(twoSlots, ['monday'], parsePeriods('05:00-06:00, 07:00-08:00, 09:00-10:00')),
      /2 periods a day/,
    );
  });

  it('allows three periods in three slots', () => {
    const next = applyPeriods(TIME_PROGRAM, ['monday'], parsePeriods('05:00-06:00, 07:00-08:00, 09:00-10:00'));
    assert.equal(next[0].monday.every((w) => w.start !== '00:00'), true);
    assert.throws(
      () => applyPeriods(TIME_PROGRAM, ['monday'], parsePeriods('05:00-06:00, 07:00-08:00, 09:00-10:00, 11:00-12:00')),
      /3 periods a day/,
    );
  });

  it('refuses a program it cannot recognise instead of rebuilding one', () => {
    assert.throws(() => applyPeriods(null, ['monday'], []), /did not report/);
    assert.throws(() => applyPeriods([], ['monday'], []), /did not report/);
    assert.throws(() => applyPeriods([{ monday: 'always' }], ['monday'], []), /known format/);
    assert.throws(() => applyPeriods(TIME_PROGRAM.slice(1), ['monday'], []), /no schedule for monday/);
  });
});

describe('setComfortPeriods', () => {
  it('sends the radiator\'s own program back with the day changed', async () => {
    const { handler, calls } = setup({ commands: ['setTimeProgram', 'setOperatingMode'] });
    await handler.setComfortPeriods('monday', '06:30-08:00');

    assert.equal(calls.executed.length, 1);
    const [name, params] = calls.executed[0];
    assert.equal(name, 'setTimeProgram');
    assert.equal(params.length, 1);
    assert.equal(params[0].length, 7);
    assert.deepEqual(params[0][0].monday[0], { start: '06:30', end: '08:00' });
    assert.deepEqual(params[0].slice(1), TIME_PROGRAM.slice(1));
    assert.ok(calls.logs.some((line) => line.includes('setTimeProgram')));
  });

  it('tries when the device never listed its commands', async () => {
    const { handler, calls } = setup({ commands: [] });
    await handler.setComfortPeriods('all', '05:00-23:00');
    assert.equal(calls.executed.length, 1);
  });

  it('does not send a command the radiator did not advertise', async () => {
    const { handler, calls } = setup({ commands: ['setOperatingMode'] });
    await assert.rejects(() => handler.setComfortPeriods('monday', '06:30-08:00'), ScheduleError);
    assert.equal(calls.executed.length, 0);
  });

  it('sends nothing for a request it cannot read', async () => {
    const { handler, calls } = setup();
    await assert.rejects(() => handler.setComfortPeriods('monday', '6am to 8am'), ScheduleError);
    await assert.rejects(() => handler.setComfortPeriods('someday', '06:00-08:00'), ScheduleError);
    assert.equal(calls.executed.length, 0);
  });

  it('sends nothing when the radiator reported no schedule', async () => {
    const { handler, calls } = setup({ states: radiatorStates({ 'core:TimeProgramState': null }) });
    await assert.rejects(() => handler.setComfortPeriods('monday', '06:30-08:00'), /did not report/);
    assert.equal(calls.executed.length, 0);
  });
});

describe('Ipala manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  const flowCard = (kind, id) => manifest.flow[kind].find((card) => card.id === id);

  it('declares the level with the values the radiator reports', () => {
    const capability = manifest.capabilities.cozytouch_heating_level;
    assert.deepEqual(capability.values.map((v) => v.id), PASS_COZYTOUCH_LEVELS);
    assert.equal(capability.setable, false);
  });

  it('gives the level an icon, and every declared capability icon exists', () => {
    // Without one Homey draws an empty dotted square beside the value
    assert.ok(manifest.capabilities.cozytouch_heating_level.icon, 'the level declares an icon');

    for (const [id, capability] of Object.entries(manifest.capabilities)) {
      if (!capability.icon) continue;
      const file = path.join(__dirname, '..', capability.icon);
      assert.ok(fs.existsSync(file), `${id} icon ${capability.icon} does not exist`);
      assert.match(fs.readFileSync(file, 'utf8'), /<svg[^>]*viewBox="0 0 (\d+) \1"/, `${id} icon has a square viewBox`);
    }
  });

  it('only offers the Flow cards to radiators that have the level', () => {
    for (const [kind, id] of [
      ['triggers', 'heating_level_changed'],
      ['conditions', 'is_heating_level'],
      ['actions', 'set_comfort_periods'],
    ]) {
      const card = flowCard(kind, id);
      assert.ok(card, `${id} is declared`);
      const device = card.args.find((arg) => arg.type === 'device');
      assert.match(device.filter, /capabilities=cozytouch_heating_level/, id);
    }
  });

  it('lets the schedule action name every day and group the handler resolves', () => {
    const day = flowCard('actions', 'set_comfort_periods').args.find((arg) => arg.name === 'day');
    for (const { id } of day.values) {
      assert.doesNotThrow(() => resolveDays(id), id);
    }
    assert.equal(day.values.length, 10);
  });

  it('has the error strings the device throws, in both languages', () => {
    for (const lang of ['en', 'fr']) {
      const strings = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${lang}.json`), 'utf8'));
      assert.ok(strings.errors.schedule_failed, `${lang} schedule_failed`);
      assert.ok(strings.errors.schedule_not_supported, `${lang} schedule_not_supported`);
    }
  });
});
