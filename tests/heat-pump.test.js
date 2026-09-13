'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isPassApcHeatPumpMain,
  isPassApcHeatPumpZone,
  isPassApcHeatPumpDevice,
  isPassApcDhw,
  isPassApcOutsideTemperatureSensor,
  isPassApcZoneTemperatureSensor,
  isZoneControlDevice,
  overkizStackBaseUrl,
  overkizEndpointIndex,
  findStackSibling,
} = require('../lib/helpers/overkiz-device');

const {
  supportedCommandNames,
  pickCommand,
} = require('../lib/helpers/overkiz-commands');

const {
  PASS_APC_COMMANDS,
  PASS_APC_STATES,
  ZONE_CONTROL_COMMANDS,
  ZONE_CONTROL_STATES,
} = require('../lib/constants/overkiz-mappings');

/**
 * Endpoints of the Alféa Extensa Duo A.I. 5 R32 (Magellan modelId 212) as the
 * reporter's Overkiz setup listed them: one io:// stack, the component names are
 * the only thing that tells the endpoints apart.
 */
const STACK = 'io://2050-1981-8444/5592202';

const FIXTURES = {
  main: {
    label: 'Alféa Extensa Duo A.I. 5 R32',
    controllableName: 'io:AtlanticPassAPCHeatPumpMainComponent',
    widget: 'AtlanticPassAPCHeatPump',
    uiClass: 'HeatingSystem',
    deviceURL: `${STACK}#1`,
    definition: {
      commands: [
        { commandName: 'setPassAPCOperatingMode', nparams: 1 },
        { commandName: 'refreshPassAPCOperatingMode', nparams: 0 },
      ],
    },
  },
  dhw: {
    label: 'Eau chaude sanitaire',
    controllableName: 'io:AtlanticPassAPCDHWComponent',
    widget: 'AtlanticPassAPCDHW',
    uiClass: 'WaterHeatingSystem',
    deviceURL: `${STACK}#2`,
    definition: {
      commands: [
        { commandName: 'setPassAPCDHWMode', nparams: 1 },
        { commandName: 'setBoostOnOffState', nparams: 1 },
      ],
    },
  },
  outsideSensor: {
    label: 'Température extérieure',
    controllableName: 'io:AtlanticPassAPCOutsideTemperatureSensor',
    widget: 'TemperatureSensor',
    uiClass: 'TemperatureSensor',
    deviceURL: `${STACK}#3`,
  },
  energySensor: {
    label: 'Consommation électrique',
    controllableName: 'io:TotalElectricalEnergyConsumptionSensor',
    widget: 'CumulativeElectricPowerConsumptionSensor',
    uiClass: 'ElectricitySensor',
    deviceURL: `${STACK}#4`,
  },
  zone: {
    label: 'Plancher',
    // Heating circuits of a heat pump are recognised on the widget: the
    // component name of this endpoint is not the one the Shogun uses.
    controllableName: 'io:AtlanticPassAPCHeatingZoneComponent',
    widget: 'AtlanticPassAPCHeatingZone',
    uiClass: 'HeatingSystem',
    deviceURL: `${STACK}#8`,
    definition: {
      commands: [
        { commandName: 'setPassAPCHeatingMode', nparams: 1 },
        { commandName: 'setDerogatedTargetTemperature', nparams: 1 },
      ],
    },
  },
  zoneSensor: {
    label: 'Plancher - sonde',
    controllableName: 'io:AtlanticPassAPCZoneTemperatureSensor',
    widget: 'TemperatureSensor',
    uiClass: 'TemperatureSensor',
    deviceURL: `${STACK}#9`,
  },
  // Second circuit of a two-circuit product, to check probes are not shared
  secondZone: {
    label: 'Radiateurs',
    controllableName: 'io:AtlanticPassAPCHeatingAndCoolingZoneComponent',
    widget: 'AtlanticPassAPCHeatingAndCoolingZone',
    uiClass: 'HeatingSystem',
    deviceURL: `${STACK}#6`,
    definition: {
      commands: [
        { commandName: 'setPassAPCHeatingMode', nparams: 1 },
        { commandName: 'setPassAPCCoolingMode', nparams: 1 },
        { commandName: 'setHeatingTargetTemperature', nparams: 1 },
      ],
    },
  },
  secondZoneSensor: {
    label: 'Radiateurs - sonde',
    controllableName: 'io:AtlanticPassAPCZoneTemperatureSensor',
    widget: 'TemperatureSensor',
    uiClass: 'TemperatureSensor',
    deviceURL: `${STACK}#7`,
  },
  // Shogun Zone Control, on its own stack and its own driver
  shogunMain: {
    label: 'Zone Control',
    controllableName: 'io:AtlanticPassAPCZoneControlMainComponent',
    widget: 'AtlanticPassAPCZoneControl',
    uiClass: 'HeatingSystem',
    deviceURL: 'io://0000-0000-0000/3333333#1',
  },
  shogunZone: {
    label: 'Zone 1',
    controllableName: 'io:AtlanticPassAPCZoneControlZoneComponent',
    widget: 'AtlanticPassAPCHeatingAndCoolingZone',
    uiClass: 'HeatingSystem',
    deviceURL: 'io://0000-0000-0000/3333333#2',
  },
  passCozytouch: {
    label: 'PASS_Actuator',
    controllableName: 'io:AtlanticElectricalHeaterIOComponent',
    widget: 'AtlanticElectricalHeater',
    uiClass: 'HeatingSystem',
    deviceURL: 'io://0000-0000-0000/1111111',
  },
};

const overkiz = (fixture) => ({ ...fixture, _protocol: 'overkiz' });

const REPORTED_STACK = [
  FIXTURES.main,
  FIXTURES.dhw,
  FIXTURES.outsideSensor,
  FIXTURES.energySensor,
  FIXTURES.zone,
  FIXTURES.zoneSensor,
].map(overkiz);

describe('Pass APC heat pump detection', () => {
  it('recognises the main unit of the reported Alféa', () => {
    assert.equal(isPassApcHeatPumpMain(FIXTURES.main), true);
    assert.equal(isPassApcHeatPumpZone(FIXTURES.main), false);
    assert.equal(isPassApcHeatPumpDevice(FIXTURES.main), true);
  });

  it('recognises a heating circuit on its widget alone', () => {
    const widgetOnly = { widget: 'AtlanticPassAPCHeatingZone' };
    assert.equal(isPassApcHeatPumpZone(widgetOnly), true);
    assert.equal(isPassApcHeatPumpZone(FIXTURES.zone), true);
    assert.equal(isPassApcHeatPumpZone(FIXTURES.secondZone), true);
    assert.equal(isPassApcHeatPumpDevice(FIXTURES.zone), true);
  });

  it('recognises the tank, the outside probe and the circuit probe', () => {
    assert.equal(isPassApcDhw(FIXTURES.dhw), true);
    assert.equal(isPassApcOutsideTemperatureSensor(FIXTURES.outsideSensor), true);
    assert.equal(isPassApcZoneTemperatureSensor(FIXTURES.zoneSensor), true);
  });

  it('keeps probes, tank and energy sensor off the heat_pump driver', () => {
    for (const fixture of [
      FIXTURES.dhw,
      FIXTURES.outsideSensor,
      FIXTURES.energySensor,
      FIXTURES.zoneSensor,
    ]) {
      assert.equal(isPassApcHeatPumpDevice(fixture), false, fixture.label);
    }
  });

  it('does not claim the Shogun Zone Control stack', () => {
    assert.equal(isPassApcHeatPumpDevice(FIXTURES.shogunMain), false);
    assert.equal(isPassApcHeatPumpDevice(FIXTURES.shogunZone), false);
    assert.equal(isPassApcHeatPumpDevice(FIXTURES.passCozytouch), false);
    // …and the Shogun driver does not claim the heat pump
    assert.equal(isZoneControlDevice(FIXTURES.main), false);
    assert.equal(isZoneControlDevice(FIXTURES.zone), false);
    assert.equal(isZoneControlDevice(FIXTURES.dhw), false);
  });
});

/** Mirrors drivers/heat_pump/driver.js#_filterDevices without loading Homey. */
function filterHeatPumpDevices(allDevices) {
  return allDevices.filter((dev) => {
    if (dev._protocol !== 'overkiz') return false;
    return isPassApcHeatPumpMain(dev) || isPassApcHeatPumpZone(dev);
  });
}

describe('heat_pump pairing rules', () => {
  it('pairs the main unit and the circuits of the reported stack', () => {
    assert.deepEqual(
      filterHeatPumpDevices(REPORTED_STACK).map((dev) => dev.label),
      ['Alféa Extensa Duo A.I. 5 R32', 'Plancher'],
    );
  });

  it('ignores Magellan duplicates of the same heat pump', () => {
    // The same product is also announced on Magellan as modelId 212; pairing it
    // twice would give a second, non-working tile for one heat pump.
    const withMagellan = [
      ...REPORTED_STACK,
      { _protocol: 'cozytouch', name: 'Alféa Extensa Duo A.I. 5 R32', modelId: 212 },
    ];
    assert.equal(filterHeatPumpDevices(withMagellan).length, 2);
  });

  it('pairs both circuits of a two-circuit product', () => {
    const stack = [...REPORTED_STACK, overkiz(FIXTURES.secondZone), overkiz(FIXTURES.secondZoneSensor)];
    assert.deepEqual(
      filterHeatPumpDevices(stack).map((dev) => dev.label).sort(),
      ['Alféa Extensa Duo A.I. 5 R32', 'Plancher', 'Radiateurs'],
    );
  });

  it('is excluded by the heater, climate and towel_rack filters', () => {
    // Those drivers reject isPassApcHeatPumpDevice before any uiClass check —
    // uiClass HeatingSystem alone used to send Alféa endpoints to the heater.
    const heatingSystems = REPORTED_STACK.filter((dev) => dev.uiClass === 'HeatingSystem');
    assert.equal(heatingSystems.length, 2);
    assert.equal(heatingSystems.every((dev) => isPassApcHeatPumpDevice(dev)), true);
  });
});

describe('Overkiz stack siblings', () => {
  it('strips the endpoint index to get the stack', () => {
    assert.equal(overkizStackBaseUrl(`${STACK}#8`), STACK);
    assert.equal(overkizStackBaseUrl(STACK), STACK);
    assert.equal(overkizStackBaseUrl(null), null);
    assert.equal(overkizEndpointIndex(`${STACK}#8`), 8);
    assert.equal(overkizEndpointIndex(STACK), null);
  });

  it('links a circuit to its main unit and its own probe', () => {
    const stack = [...REPORTED_STACK, overkiz(FIXTURES.secondZone), overkiz(FIXTURES.secondZoneSensor)];

    const main = findStackSibling(stack, `${STACK}#8`, isPassApcHeatPumpMain);
    assert.equal(main.deviceURL, `${STACK}#1`);

    // Nearest probe above the circuit, so two circuits do not share one probe
    assert.equal(
      findStackSibling(stack, `${STACK}#8`, isPassApcZoneTemperatureSensor).deviceURL,
      `${STACK}#9`,
    );
    assert.equal(
      findStackSibling(stack, `${STACK}#6`, isPassApcZoneTemperatureSensor).deviceURL,
      `${STACK}#7`,
    );
  });

  it('links the main unit to the outside probe', () => {
    assert.equal(
      findStackSibling(REPORTED_STACK, `${STACK}#1`, isPassApcOutsideTemperatureSensor).deviceURL,
      `${STACK}#3`,
    );
  });

  it('never looks outside its own stack', () => {
    const mixed = [...REPORTED_STACK, overkiz(FIXTURES.shogunMain), overkiz(FIXTURES.shogunZone)];
    assert.equal(findStackSibling(mixed, 'io://0000-0000-0000/3333333#2', isPassApcOutsideTemperatureSensor), null);
    assert.equal(findStackSibling(mixed, `${STACK}#1`, isPassApcDhw).deviceURL, `${STACK}#2`);
  });
});

describe('command detection', () => {
  it('reads the command names an endpoint advertises', () => {
    assert.deepEqual(supportedCommandNames(FIXTURES.zone), [
      'setPassAPCHeatingMode',
      'setDerogatedTargetTemperature',
    ]);
    assert.deepEqual(supportedCommandNames(FIXTURES.outsideSensor), []);
    assert.deepEqual(supportedCommandNames({ definition: { commands: ['setTargetTemperature'] } }), [
      'setTargetTemperature',
    ]);
    assert.deepEqual(supportedCommandNames(null), []);
  });

  it('picks the setpoint command the circuit really has', () => {
    const candidates = [
      PASS_APC_COMMANDS.SET_HEATING_TARGET_TEMP,
      PASS_APC_COMMANDS.SET_DEROGATED_TARGET_TEMP,
      PASS_APC_COMMANDS.SET_TARGET_TEMP,
    ];
    // The reported Alféa circuit only has setDerogatedTargetTemperature
    assert.equal(
      pickCommand(supportedCommandNames(FIXTURES.zone), candidates),
      'setDerogatedTargetTemperature',
    );
    // A circuit advertising the preferred name gets it
    assert.equal(
      pickCommand(supportedCommandNames(FIXTURES.secondZone), candidates),
      'setHeatingTargetTemperature',
    );
  });

  it('returns null when the device advertises none of the candidates', () => {
    assert.equal(
      pickCommand(['setPassAPCHeatingMode'], [PASS_APC_COMMANDS.SET_COOLING_MODE]),
      null,
    );
    assert.equal(
      pickCommand(supportedCommandNames(FIXTURES.main), [PASS_APC_COMMANDS.SET_AUTO_SWITCH]),
      null,
    );
  });

  it('falls back to the first candidate for devices paired before this existed', () => {
    // Their store has no overkizCommands: assume the usual name rather than
    // leaving the control dead.
    assert.equal(pickCommand(undefined, ['setPassAPCHeatingMode', 'x']), 'setPassAPCHeatingMode');
    assert.equal(pickCommand([], ['setPassAPCHeatingMode', 'x']), 'setPassAPCHeatingMode');
    assert.equal(pickCommand([], []), null);
  });
});

/** Mirrors drivers/heat_pump/driver.js#_stackHasCooling. */
function stackHasCooling(dev, discovered) {
  const commands = supportedCommandNames(dev);
  if (commands.includes(PASS_APC_COMMANDS.SET_COOLING_MODE)
    || commands.includes(PASS_APC_COMMANDS.SET_COOLING_ON_OFF)
    || commands.includes(PASS_APC_COMMANDS.SET_AUTO_SWITCH)) {
    return true;
  }
  const base = overkizStackBaseUrl(dev.deviceURL);
  return discovered.some((sibling) => sibling
    && overkizStackBaseUrl(sibling.deviceURL) === base
    && String(sibling.widget || '').includes('AndCooling'));
}

describe('cooling support detection', () => {
  it('reports no cooling for the heating-only Extensa', () => {
    assert.equal(stackHasCooling(FIXTURES.main, REPORTED_STACK), false);
    assert.equal(stackHasCooling(FIXTURES.zone, REPORTED_STACK), false);
  });

  it('reports cooling when a circuit advertises it', () => {
    const stack = [...REPORTED_STACK, overkiz(FIXTURES.secondZone)];
    assert.equal(stackHasCooling(FIXTURES.secondZone, stack), true);
    // …including for the main unit, which has no cooling command of its own
    assert.equal(stackHasCooling(FIXTURES.main, stack), true);
  });
});

describe('Pass APC protocol constants', () => {
  it('keeps the Zone Control names as aliases', () => {
    assert.equal(ZONE_CONTROL_STATES, PASS_APC_STATES);
    assert.equal(ZONE_CONTROL_COMMANDS, PASS_APC_COMMANDS);
  });

  it('carries the setpoint states heat pump circuits report', () => {
    assert.equal(PASS_APC_STATES.DEROGATED_TARGET_TEMP, 'core:DerogatedTargetTemperatureState');
    assert.equal(PASS_APC_STATES.COMFORT_HEATING_TARGET_TEMP, 'core:ComfortHeatingTargetTemperatureState');
    assert.equal(PASS_APC_COMMANDS.SET_DEROGATED_TARGET_TEMP, 'setDerogatedTargetTemperature');
  });
});

// ── Handlers ────────────────────────────────────────────────────
//
// The handlers only talk to their ctx, so they run without Homey. This is the
// only coverage that exists for the commands sent to a product nobody here has.

const HeatPumpMainOverkizHandler = require('../drivers/heat_pump/handlers/overkiz-main');
const HeatPumpZoneOverkizHandler = require('../drivers/heat_pump/handlers/overkiz-zone');

function fakeCtx({ store = {}, states = [], siblingStates = {}, capabilities = [] } = {}) {
  const sent = [];
  const capabilityValues = {};
  const capabilityOptions = {};
  return {
    log: () => {},
    error: () => {},
    store,
    hasCapability: (name) => capabilities.includes(name),
    setCapability: (name, value) => { capabilityValues[name] = value; },
    setCapabilityOptions: (name, options) => { capabilityOptions[name] = options; },
    getDeviceState: async () => states,
    executeCommand: async (command, params) => { sent.push([command, params]); },
    api: { getDeviceState: async (url) => siblingStates[url] || [] },
    sent,
    capabilityValues,
    capabilityOptions,
  };
}

const state = (name, value) => ({ name, value });

describe('heat pump main unit handler', () => {
  const mainStore = {
    overkizCommands: ['setPassAPCOperatingMode'],
    passApcCooling: false,
    passApcOutsideSensorURL: `${STACK}#3`,
  };

  it('sets the system operating mode', async () => {
    const ctx = fakeCtx({ store: mainStore });
    await new HeatPumpMainOverkizHandler(ctx).setMode('heat');
    assert.deepEqual(ctx.sent, [['setPassAPCOperatingMode', ['heating']]]);
    assert.equal(ctx.capabilityValues.cozytouch_hvac_mode, 'heat');
    assert.equal(ctx.capabilityValues.onoff, true);
  });

  it('stops the heat pump on off', async () => {
    const ctx = fakeCtx({ store: mainStore });
    await new HeatPumpMainOverkizHandler(ctx).setOnOff(false);
    assert.deepEqual(ctx.sent, [['setPassAPCOperatingMode', ['stop']]]);
    assert.equal(ctx.capabilityValues.onoff, false);
  });

  it('restores the last mode on on, never off', async () => {
    const ctx = fakeCtx({
      store: mainStore,
      states: [state('io:LastPassAPCOperatingModeState', 'stop')],
    });
    await new HeatPumpMainOverkizHandler(ctx).setOnOff(true);
    assert.deepEqual(ctx.sent, [['setPassAPCOperatingMode', ['heating']]]);
  });

  it('refuses auto on a unit without the auto switch, naming it', async () => {
    const ctx = fakeCtx({ store: mainStore });
    await assert.rejects(
      () => new HeatPumpMainOverkizHandler(ctx).setMode('auto'),
      /auto switch/,
    );
    assert.deepEqual(ctx.sent, []);
  });

  it('uses the auto switch when the unit has one', async () => {
    const ctx = fakeCtx({
      store: {
        ...mainStore,
        passApcCooling: true,
        overkizCommands: ['setPassAPCOperatingMode', 'setHeatingCoolingAutoSwitch'],
      },
    });
    const handler = new HeatPumpMainOverkizHandler(ctx);
    await handler.setMode('auto');
    assert.deepEqual(ctx.sent, [['setHeatingCoolingAutoSwitch', ['on']]]);
    // …and turns it back off before a plain mode, otherwise the heat pump keeps switching
    await handler.setMode('cool');
    assert.deepEqual(ctx.sent.slice(1), [
      ['setHeatingCoolingAutoSwitch', ['off']],
      ['setPassAPCOperatingMode', ['cooling']],
    ]);
  });

  it('reads the mode and the outside probe of the stack', async () => {
    const ctx = fakeCtx({
      store: mainStore,
      capabilities: ['measure_temperature', 'cozytouch_hvac_mode', 'onoff'],
      states: [state('io:PassAPCOperatingModeState', 'heating')],
      siblingStates: { [`${STACK}#3`]: [state('core:TemperatureState', 7.5)] },
    });
    await new HeatPumpMainOverkizHandler(ctx).updateState();
    assert.equal(ctx.capabilityValues.measure_temperature, 7.5);
    assert.equal(ctx.capabilityValues.cozytouch_hvac_mode, 'heat');
    assert.equal(ctx.capabilityValues.onoff, true);
  });

  it('never reports auto on a heating-only unit', async () => {
    const ctx = fakeCtx({
      store: mainStore,
      capabilities: ['cozytouch_hvac_mode'],
      states: [
        state('core:HeatingCoolingAutoSwitchState', 'on'),
        state('io:PassAPCOperatingModeState', 'heating'),
      ],
    });
    await new HeatPumpMainOverkizHandler(ctx).updateState();
    assert.equal(ctx.capabilityValues.cozytouch_hvac_mode, 'heat');
  });
});

describe('heat pump circuit handler', () => {
  const zoneStore = {
    overkizCommands: [
      'setPassAPCHeatingMode',
      'setDerogatedTargetTemperature',
      'setDerogationOnOffState',
    ],
    passApcCooling: false,
    passApcMainDeviceURL: `${STACK}#1`,
    passApcTemperatureSensorURL: `${STACK}#9`,
  };
  const heatingMain = { [`${STACK}#1`]: [state('io:PassAPCOperatingModeState', 'heating')] };

  it('sends the setpoint command the circuit advertises, then the derogation', async () => {
    const ctx = fakeCtx({ store: zoneStore, siblingStates: heatingMain });
    await new HeatPumpZoneOverkizHandler(ctx).setTargetTemperature(21);
    assert.deepEqual(ctx.sent, [
      ['setDerogatedTargetTemperature', [21]],
      ['setDerogationOnOffState', ['on']],
    ]);
    assert.equal(ctx.capabilityValues.target_temperature, 21);
  });

  it('fails naming the commands when the circuit has no setpoint command', async () => {
    const ctx = fakeCtx({
      store: { ...zoneStore, overkizCommands: ['setPassAPCHeatingMode'] },
      siblingStates: heatingMain,
    });
    await assert.rejects(
      () => new HeatPumpZoneOverkizHandler(ctx).setTargetTemperature(21),
      /setHeatingTargetTemperature/,
    );
    assert.deepEqual(ctx.sent, []);
  });

  it('turns a circuit off through its heating mode', async () => {
    const ctx = fakeCtx({
      store: { ...zoneStore, overkizCommands: [...zoneStore.overkizCommands, 'setHeatingOnOffState'] },
      siblingStates: heatingMain,
    });
    await new HeatPumpZoneOverkizHandler(ctx).setOnOff(false);
    assert.deepEqual(ctx.sent, [
      ['setHeatingOnOffState', ['off']],
      ['setPassAPCHeatingMode', ['stop']],
    ]);
    assert.equal(ctx.capabilityValues.cozytouch_heating_mode, 'off');
    assert.equal(ctx.capabilityValues.onoff, false);
  });

  it('puts a circuit on the schedule for prog', async () => {
    const ctx = fakeCtx({ store: zoneStore, siblingStates: heatingMain });
    await new HeatPumpZoneOverkizHandler(ctx).setMode('prog');
    assert.deepEqual(ctx.sent, [['setPassAPCHeatingMode', ['internalScheduling']]]);
    assert.equal(ctx.capabilityValues.cozytouch_heating_mode, 'prog');
  });

  it('reads mode, setpoint and room temperature of the circuit', async () => {
    const ctx = fakeCtx({
      store: zoneStore,
      capabilities: ['target_temperature', 'measure_temperature', 'cozytouch_heating_mode', 'onoff'],
      states: [
        state('io:PassAPCHeatingModeState', 'internalScheduling'),
        // The reported Alféa has no core:HeatingTargetTemperatureState
        state('core:DerogatedTargetTemperatureState', 20.5),
        state('core:MinimumHeatingTargetTemperatureState', 16),
        state('core:MaximumHeatingTargetTemperatureState', 24),
      ],
      siblingStates: {
        ...heatingMain,
        [`${STACK}#9`]: [state('core:TemperatureState', 19.4)],
      },
    });
    await new HeatPumpZoneOverkizHandler(ctx).updateState();
    assert.equal(ctx.capabilityValues.cozytouch_heating_mode, 'prog');
    assert.equal(ctx.capabilityValues.target_temperature, 20.5);
    assert.equal(ctx.capabilityValues.measure_temperature, 19.4);
    assert.deepEqual(ctx.capabilityOptions.target_temperature, { min: 16, max: 24, step: 0.5 });
  });

  it('ignores a setpoint range that cannot be degrees', async () => {
    const ctx = fakeCtx({
      store: zoneStore,
      capabilities: ['target_temperature'],
      states: [
        state('io:PassAPCHeatingModeState', 'manu'),
        state('core:MinimumHeatingTargetTemperatureState', 0),
        state('core:MaximumHeatingTargetTemperatureState', 0),
      ],
      siblingStates: heatingMain,
    });
    await new HeatPumpZoneOverkizHandler(ctx).updateState();
    assert.equal(ctx.capabilityOptions.target_temperature, undefined);
  });

  it('works when the main unit cannot be read', async () => {
    const ctx = fakeCtx({
      store: { ...zoneStore, passApcMainDeviceURL: null },
      capabilities: ['cozytouch_heating_mode'],
      states: [state('io:PassAPCHeatingModeState', 'manu')],
    });
    await new HeatPumpZoneOverkizHandler(ctx).updateState();
    assert.equal(ctx.capabilityValues.cozytouch_heating_mode, 'manual');
  });
});
