'use strict';

/**
 * Whether a Magellan device can actually drive the tiles a driver would give it.
 *
 * Classification is by `modelId`, but the capability IDs a device answers on are
 * per `productId` — so a modelId in the right family says nothing about whether
 * this app can read or write anything on that device. `TESC_0` / `TESC_1` on an
 * Alféa Extensa S account were classified TOWEL_RACK, paired, and produced two
 * devices that report `19`, `109`, `218`, `106000` and none of the nine IDs the
 * towel-rack handler reads: no value on any tile, a warning badge, and every
 * write refused. The pairing list offered them anyway, and 1.4.10's new pairing
 * error went further and *recommended* Towel Rack for them.
 *
 * The setup view sends each device's capability list alongside its identity (see
 * CozyTouchAPI.getSetup), so this is answerable before pairing rather than after
 * a user reports an empty device. A device that reports not one of the IDs the
 * driver reads is not offered.
 *
 * Deliberately permissive on anything unknown: a device that announced no
 * capability list has not been judged, only unseen, and hiding it would trade a
 * device that shows nothing for a device that cannot be added at all.
 */

const { capabilityIdsOf, normalizeId } = require('./magellan-capabilities');

/**
 * The numeric capability IDs a resolved cap-ID block reads.
 *
 * A per-product block sets an entry to `null` for a capability the product does
 * not have (see CLIMATE_CAP_IDS_BY_PRODUCT), which is exactly what must not
 * count here.
 *
 * @param {object} block - e.g. the result of `climateCapIds(productId)`
 * @returns {number[]}
 */
function mappedCapabilityIds(block) {
  if (!block || typeof block !== 'object') return [];
  const ids = new Set();
  for (const value of Object.values(block)) {
    const id = normalizeId(value);
    if (id !== null) ids.add(id);
  }
  return [...ids];
}

/**
 * Does this device report at least one of the capability IDs the driver reads?
 *
 * @param {object} dev - a device as discovery returned it, tagged with `_protocol`
 * @param {number[]} mappedIds - result of `mappedCapabilityIds()`
 * @returns {boolean} true for an Overkiz device (this is a Magellan question),
 *   for a device that reported no capability list, and when the driver maps no
 *   ID at all — none of those three is evidence against the device.
 */
function reportsMappedCapability(dev, mappedIds) {
  if (!dev || dev._protocol === 'overkiz') return true;

  const reported = capabilityIdsOf(dev.capabilities);
  if (reported.size === 0) return true;

  const wanted = (mappedIds || []).map(normalizeId).filter((id) => id !== null);
  if (wanted.length === 0) return true;

  return wanted.some((id) => reported.has(id));
}

module.exports = {
  mappedCapabilityIds,
  reportsMappedCapability,
};
