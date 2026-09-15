'use strict';

/**
 * Homey's list_devices template drops already-paired devices by comparing the
 * whole `data` object. Devices paired before 1.3.7 still carry username/password
 * in their immutable `data`; current pairing writes identifiers only, so Homey
 * no longer treats them as the same device and would offer them again (and
 * allow a duplicate with a different data shape). Match on `data.id` instead.
 *
 * @param {Array<{ data?: { id?: string } }>} candidates Mapped pairing candidates.
 * @param {Array<{ getData?: () => object, data?: object }>} pairedDevices
 *   Homey devices already on this driver (`Driver#getDevices()`), or plain
 *   `{ data }` stubs in tests.
 * @returns {Array} Candidates whose `data.id` is not already paired.
 */
function excludeAlreadyPaired(candidates, pairedDevices) {
  const existingIds = new Set();
  for (const device of pairedDevices || []) {
    const data = typeof device.getData === 'function' ? device.getData() : device.data;
    if (data && data.id != null) existingIds.add(data.id);
  }
  return (candidates || []).filter((candidate) => {
    const id = candidate && candidate.data && candidate.data.id;
    return id == null || !existingIds.has(id);
  });
}

module.exports = { excludeAlreadyPaired };
