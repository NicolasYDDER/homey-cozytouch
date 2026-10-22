'use strict';

const { pickCommand } = require('../../../lib/helpers/overkiz-commands');
const {
  DHW_COMMANDS,
  DHW_STATES,
  firstStateValue,
  isOn,
  activeSetpoint,
  describeTankSchedule,
} = require('../../../lib/helpers/pass-apc-dhw');
const { PendingWrites } = require('../../../lib/helpers/pending-writes');

/**
 * Overkiz handler for the hot water tank of a Pass APC heat pump
 * (AtlanticPassAPCDHWComponent) — the tank of an Alféa Duo, driven by the heat
 * pump itself rather than by its own controller.
 *
 * Its controls are an on/off switch, a boost and a setpoint, not the
 * Manual/Eco/Auto picker of a standalone tank: the "mode" it reports names a
 * scheduling type (peakAndOffPeakScheduling), which this app neither names nor
 * writes. See lib/helpers/pass-apc-dhw.js for what the tank reports.
 *
 * Every command is picked from what the device advertises, and a control the
 * tank does not have fails with a message saying so instead of sending something
 * the heat pump refuses.
 *
 * The cloud keeps reporting the state from before a command for a while, and the
 * device re-polls a few seconds after every command: without holding what was
 * just written (PendingWrites), Auto went back to Off and Boost back to off on
 * that first re-poll, whether or not the tank had taken the command.
 */

class WaterHeaterOverkizPassApcHandler {

  constructor(ctx) {
    this.ctx = ctx;
    // Schedule descriptions already written to the log, so a tank that sits in
    // one state does not repeat it on every poll.
    this._loggedSchedules = new Set();
    this._commandsLogged = false;
    this._writes = new PendingWrites({ log: (line) => ctx.log(line) });
  }

  /**
   * A value read from the tank, shown unless it is the cloud still answering
   * with the state from before a command.
   */
  _show(name, value) {
    if (this._writes.accepts(name, value)) this.ctx.setCapability(name, value);
  }

  /** A value just sent: shown at once, and kept until the tank reports it. */
  _showWritten(name, value) {
    this._writes.expect(name, value);
    this.ctx.setCapability(name, value);
  }

  _command(candidates, { required = true } = {}) {
    const name = pickCommand(this.ctx.store.overkizCommands, candidates);
    if (!name && required) {
      throw new Error(`This tank accepts none of these commands: ${candidates.join(', ')}`);
    }
    return name;
  }

  _advertises(commandName) {
    const supported = this.ctx.store.overkizCommands;
    return Array.isArray(supported) && supported.includes(commandName);
  }

  /**
   * Writes the setpoint the tile is showing — the eco one in eco profile, the
   * comfort one otherwise — then asks the tank to re-publish it. Without the
   * second step the cloud keeps answering with the old value until the next
   * state refresh, and the slider snaps back for up to a sync interval.
   */
  async setTargetTemperature(value) {
    const states = await this.ctx.getDeviceState();
    const eco = activeSetpoint(states) === 'eco';

    const setter = this._command(
      eco
        ? [...DHW_COMMANDS.SET_ECO_TARGET, ...DHW_COMMANDS.SET_TARGET_TEMP]
        : [...DHW_COMMANDS.SET_COMFORT_TARGET, ...DHW_COMMANDS.SET_TARGET_TEMP],
    );
    await this.ctx.executeCommand(setter, [value]);

    await this._refresh([
      eco ? DHW_COMMANDS.REFRESH_ECO_TARGET : DHW_COMMANDS.REFRESH_COMFORT_TARGET,
      DHW_COMMANDS.REFRESH_TARGET,
    ]);
  }

  /**
   * Best effort, and only for commands the tank advertises: the setpoint is
   * already sent, so a refresh it declines must not turn that into an error.
   */
  async _refresh(commandNames) {
    for (const name of commandNames) {
      if (!this._advertises(name)) continue;
      try {
        await this.ctx.executeCommand(name, []);
      } catch (err) {
        this.ctx.log(`${name} failed (the setpoint itself was sent): ${err.message}`);
      }
    }
  }

  /**
   * Off switches the tank off; Auto switches it on and lets it follow its own
   * schedule. Nothing else exists to pick.
   */
  async setMode(mode) {
    if (mode === 'off') {
      await this.ctx.executeCommand(this._command(DHW_COMMANDS.SET_ON_OFF), ['off']);
      this._showWritten('cozytouch_heating_mode', 'off');
      return;
    }

    if (mode === 'auto') {
      // A tank with no on/off command is always on: Auto is already true.
      const onOff = this._command(DHW_COMMANDS.SET_ON_OFF, { required: false });
      if (onOff) await this.ctx.executeCommand(onOff, ['on']);
      this._showWritten('cozytouch_heating_mode', 'auto');
      return;
    }

    throw new Error(`Unsupported water heater mode: ${mode}`);
  }

  async setBoost(value) {
    await this.ctx.executeCommand(this._command(DHW_COMMANDS.SET_BOOST), [value ? 'on' : 'off']);
    this._writes.expect('cozytouch_boost', value);
  }

  async setAwayMode(value) {
    await this.ctx.executeCommand(this._command(DHW_COMMANDS.SET_ABSENCE), [value ? 'on' : 'off']);
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    this._noteCommands();
    this._noteSchedule(states);

    const currentTemp = firstStateValue(states, DHW_STATES.CURRENT_TEMP);
    if (currentTemp !== null) this.ctx.setCapability('measure_temperature', parseFloat(currentTemp));

    const targetTemp = firstStateValue(states, DHW_STATES.TARGET_TEMP);
    if (targetTemp !== null) this.ctx.setCapability('target_temperature', parseFloat(targetTemp));

    this._show('cozytouch_boost', isOn(firstStateValue(states, DHW_STATES.BOOST)));

    // Only a tank that has an absence control reports one.
    const absence = firstStateValue(states, DHW_STATES.ABSENCE);
    const isAway = absence !== null && isOn(absence);
    if (absence !== null) this.ctx.setCapability('cozytouch_away_mode', isAway);

    const onOff = firstStateValue(states, DHW_STATES.ON_OFF);
    if (onOff === null && !isAway) return;
    this._show('cozytouch_heating_mode', isAway || !isOn(onOff) ? 'off' : 'auto');
  }

  /**
   * Once per app run: the commands this tank's controls are picked from. They
   * are recorded at pairing, so a tank paired by an earlier version has none and
   * every command goes out unchecked — which a report about a control that does
   * nothing needs to know before anything else.
   */
  _noteCommands() {
    if (this._commandsLogged) return;
    this._commandsLogged = true;

    const supported = this.ctx.store.overkizCommands;
    if (!Array.isArray(supported) || supported.length === 0) {
      this.ctx.log('No command list stored for this tank (paired before commands were recorded): commands are sent without checking the tank accepts them. Removing and adding the tank again records them.');
      return;
    }
    this.ctx.log(`Commands this tank accepts: ${supported.join(', ')}`);
  }

  /**
   * The mode, profile and configuration have no tile, so the log is the only
   * place they show up — once per distinct combination, which is what a support
   * report needs to name them.
   */
  _noteSchedule(states) {
    const description = describeTankSchedule(states);
    if (description === null || this._loggedSchedules.has(description)) return;
    this._loggedSchedules.add(description);
    this.ctx.log(`Tank reports ${description}. This tank is driven by its on/off switch and boost; these are not named in the app.`);
  }

}

module.exports = WaterHeaterOverkizPassApcHandler;
module.exports.DHW_COMMANDS = DHW_COMMANDS;
module.exports.DHW_STATES = DHW_STATES;
