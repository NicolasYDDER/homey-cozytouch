'use strict';

/**
 * Weekly comfort schedule of an adjustable-setpoint radiator (Ipala).
 *
 * core:TimeProgramState is a list of seven single-key objects, one per day, each
 * holding a fixed number of `{ start, end }` windows (three on every unit seen so
 * far); `00:00`–`00:00` marks a window that is not used:
 *
 *   [{ monday: [{ start: '05:00', end: '09:00' }, { start: '17:00', end: '23:00' },
 *               { start: '00:00', end: '00:00' }] }, { tuesday: [...] }, ...]
 *
 * A window is a comfort period; outside every window the radiator is at its eco
 * level. setTimeProgram is sent the same structure back, so a change is made by
 * reading the program, replacing the days asked for and leaving everything else
 * exactly as the radiator reported it.
 */

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// What a Flow card can name: one day, or a group written to in a single command.
const DAY_GROUPS = {
  weekdays: DAYS.slice(0, 5),
  weekend: DAYS.slice(5),
  all: DAYS,
};

const EMPTY_WINDOW = { start: '00:00', end: '00:00' };

// The radiator's own automatic program works in half hours (48 slots a day), and
// every window seen in a dump starts and ends on one.
const STEP_MINUTES = 30;

/** A schedule request that cannot be applied; the message says why. */
class ScheduleError extends Error {}

/** Day name(s) a Flow card value stands for. */
function resolveDays(day) {
  if (DAYS.includes(day)) return [day];
  if (DAY_GROUPS[day]) return DAY_GROUPS[day];
  throw new ScheduleError(`unknown day "${day}"`);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toMinutes(hours, minutes, original) {
  if (hours > 23 || minutes > 59) {
    throw new ScheduleError(`"${original}" is not a time of day`);
  }
  const total = hours * 60 + minutes;
  if (total % STEP_MINUTES !== 0) {
    throw new ScheduleError(`"${original}" is not on the hour or half hour`);
  }
  return total;
}

function toClock(total) {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function parsePeriod(text) {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new ScheduleError(`"${text.trim()}" is not a period like 06:30-08:00`);
  }
  const start = toMinutes(Number(match[1]), Number(match[2]), `${match[1]}:${match[2]}`);
  const end = toMinutes(Number(match[3]), Number(match[4]), `${match[3]}:${match[4]}`);
  if (end <= start) {
    throw new ScheduleError(`"${text.trim()}" ends before it starts (a period stays within one day, up to 23:30)`);
  }
  return { start, end };
}

/**
 * "06:30-08:00, 17:00-22:00" → the windows, earliest first. Empty text, or
 * "none", means no comfort period at all, i.e. eco all day (a Flow text field
 * cannot always be left empty). Commas and semicolons both separate.
 *
 * @returns {{start: string, end: string}[]}
 */
function parsePeriods(text) {
  const source = text === undefined || text === null ? '' : String(text);
  if (/^\s*(none|off|-)?\s*$/i.test(source)) return [];

  const parsed = source.split(/[,;]/).map(parsePeriod).sort((a, b) => a.start - b.start);
  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i].start < parsed[i - 1].end) {
      throw new ScheduleError(`${toClock(parsed[i - 1].start)}-${toClock(parsed[i - 1].end)} overlaps ${toClock(parsed[i].start)}-${toClock(parsed[i].end)}`);
    }
  }
  return parsed.map((p) => ({ start: toClock(p.start), end: toClock(p.end) }));
}

function dayOf(entry) {
  return entry && typeof entry === 'object' ? Object.keys(entry)[0] : undefined;
}

/**
 * The program with `days` replaced by `periods`; the other days are returned as
 * they came. Nothing is invented: a program that is not in the shape described
 * above is refused rather than rebuilt from guesses.
 *
 * @param {object[]} program - core:TimeProgramState as the radiator reported it
 * @param {string[]} days
 * @param {{start: string, end: string}[]} periods - from parsePeriods()
 */
function applyPeriods(program, days, periods) {
  if (!Array.isArray(program) || program.length === 0) {
    throw new ScheduleError('the radiator did not report its schedule');
  }

  const found = new Set();
  const next = program.map((entry) => {
    const day = dayOf(entry);
    if (!days.includes(day)) return entry;

    const windows = entry[day];
    if (!Array.isArray(windows) || windows.length === 0) {
      throw new ScheduleError(`the schedule of ${day} is not in a known format`);
    }
    if (periods.length > windows.length) {
      throw new ScheduleError(`this radiator keeps ${windows.length} periods a day at most`);
    }
    found.add(day);
    const filled = periods.map((p) => ({ ...p }));
    while (filled.length < windows.length) filled.push({ ...EMPTY_WINDOW });
    return { [day]: filled };
  });

  const missing = days.filter((day) => !found.has(day));
  if (missing.length > 0) {
    throw new ScheduleError(`the radiator reported no schedule for ${missing.join(', ')}`);
  }
  return next;
}

module.exports = {
  DAYS,
  DAY_GROUPS,
  ScheduleError,
  resolveDays,
  parsePeriods,
  applyPeriods,
};
