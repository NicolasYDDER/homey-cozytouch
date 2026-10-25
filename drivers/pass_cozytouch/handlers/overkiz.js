'use strict';

const {
  COMMANDS,
  STATES,
  PASS_COZYTOUCH_LEVELS,
  getStateValue,
} = require('../../../lib/constants/overkiz-mappings');
const { PendingWrites } = require('../../../lib/helpers/pending-writes');

/**
 * Overkiz handler for Atlantic Pass Cozytouch (ref. 602251).
 * Uses setHeatingLevel only — no temperature setpoint on the module itself.
 *
 * The cloud keeps answering with the heating level from before a command for a
 * while, so what was just written is held on the tiles until the Pass agrees
 * (PendingWrites) instead of flipping back at the next poll — the same lag the
 * Ipala already guards against.
 */
class PassCozytouchOverkizHandler {

  constructor(ctx) {
    this.ctx = ctx;
    this._writes = new PendingWrites({ log: (line) => ctx.log(line) });
  }

  /** A value read from the Pass, shown unless the cloud is still catching up. */
  _show(name, value) {
    if (this._writes.accepts(name, value)) this.ctx.setCapability(name, value);
  }

  async setOnOff(value) {
    await this.setLevel(value ? 'comfort' : 'off');
  }

  async setLevel(level) {
    if (!PASS_COZYTOUCH_LEVELS.includes(level)) {
      throw new Error(`Unsupported Pass Cozytouch level: ${level}`);
    }
    await this.ctx.executeCommand(COMMANDS.SET_HEATING_LEVEL, [level]);
    this.ctx.setCapability('cozytouch_pass_level', level);
    this.ctx.setCapability('onoff', level !== 'off');
    this._writes.expect('cozytouch_pass_level', level);
    this._writes.expect('onoff', level !== 'off');
  }

  async updateState() {
    const states = await this.ctx.getDeviceState();

    // io:TargetHeatingLevelState — not STATES.HEATING_LEVEL (that key does not
    // exist; a typo here made every poll fall back to on→comfort / off→off and
    // wiped modes set from Flow/scénarios).
    const level = getStateValue(states, STATES.TARGET_HEATING_LEVEL);
    if (level !== null) {
      const normalized = PASS_COZYTOUCH_LEVELS.includes(level) ? level : 'off';
      this._show('cozytouch_pass_level', normalized);
      this._show('onoff', normalized !== 'off');
      return;
    }

    // Fallback if heating level state is missing
    const onOff = getStateValue(states, STATES.ON_OFF);
    if (onOff !== null) {
      const isOn = onOff === 'on';
      this._show('onoff', isOn);
      this._show('cozytouch_pass_level', isOn ? 'comfort' : 'off');
    }
  }

}

module.exports = PassCozytouchOverkizHandler;
