'use strict';

/**
 * Helpers for the Magellan (Cozytouch) capability payload.
 *
 * Magellan answers per *product*, not per model family: a tank classified as
 * WATER_HEATER can implement a completely different set of capability IDs than
 * the ones this app maps. When that happens nothing in the app says so — every
 * read silently returns null (the tile stays empty) and every write comes back
 * as an opaque 404:
 *
 *   {"code":36002008,"message":"There is no implementation for capability Id 2
 *    on product Id 7.","type":"NoCapabilityImplementationFound"}
 *   {"code":36002005,"message":"Capability Id '10' not found.",
 *    "type":"UnknownCapabilityId"}
 *
 * So: tolerate IDs coming back as numbers or strings, be able to dump the raw
 * payload once per device (that list is exactly what adding support needs), and
 * turn those two 404s into something a user can read.
 */

// An AQUEO ACI HYB reports 86 capabilities and its setpoint limits sit at the
// very end of that list (105301 / 105304), so the dump has to reach past them.
const MAX_DUMP_ENTRIES = 120;
const MAX_VALUE_CHARS = 32;

// Magellan error types meaning "this device has no such control", as opposed to
// a transport or auth failure that is worth retrying.
const UNSUPPORTED_CAPABILITY_TYPES = ['NoCapabilityImplementationFound', 'UnknownCapabilityId'];

function normalizeId(id) {
  if (id === null || id === undefined || id === '') return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

function asList(capabilities) {
  return Array.isArray(capabilities) ? capabilities : [];
}

/**
 * Find one capability entry, whatever type the API used for its ID.
 * @returns {object|null}
 */
function findCapability(capabilities, capabilityId) {
  const wanted = normalizeId(capabilityId);
  if (wanted === null) return null;
  const found = asList(capabilities).find((cap) => cap && normalizeId(cap.capabilityId) === wanted);
  return found || null;
}

/**
 * IDs the device actually reported, as numbers.
 * @returns {Set<number>}
 */
function capabilityIdsOf(capabilities) {
  const ids = new Set();
  for (const cap of asList(capabilities)) {
    const id = cap && normalizeId(cap.capabilityId);
    if (id !== null) ids.add(id);
  }
  return ids;
}

function formatValue(value) {
  if (value === null || value === undefined) return '-';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

/**
 * One-line dump of a capability payload: `7 "Temperature"=52.5, 40=55, …`.
 * Names are included when the API sends them, since they are what makes an
 * unknown ID mappable from a diagnostic report alone.
 */
function describeCapabilities(capabilities, max = MAX_DUMP_ENTRIES) {
  const list = asList(capabilities);
  if (list.length === 0) return '(empty)';

  const described = list.slice(0, max).map((cap) => {
    const id = cap && cap.capabilityId !== undefined ? cap.capabilityId : '?';
    const name = cap && cap.name ? ` "${cap.name}"` : '';
    return `${id}${name}=${formatValue(cap && cap.value)}`;
  });
  if (list.length > max) described.push(`+${list.length - max}`);
  return described.join(', ');
}

/**
 * True when the API refused a write because the device has no such capability,
 * either wrapped by CozyTouchDevice or raw from CozyTouchAPI.
 */
function isCapabilityUnsupportedError(err) {
  if (!err) return false;
  if (err.capabilityUnsupported === true) return true;
  return unsupportedCapabilityType(err) !== null;
}

function unsupportedCapabilityType(err) {
  if (!err || !err.body) return null;
  let parsed = err.body;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  const type = parsed && parsed.type;
  return UNSUPPORTED_CAPABILITY_TYPES.includes(type) ? type : null;
}

module.exports = {
  findCapability,
  capabilityIdsOf,
  describeCapabilities,
  isCapabilityUnsupportedError,
  unsupportedCapabilityType,
  normalizeId,
  MAX_DUMP_ENTRIES,
};
