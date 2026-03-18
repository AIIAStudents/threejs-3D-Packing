function toInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseAssignedGroupIds(assignedGroupIds) {
  if (!assignedGroupIds) {
    return [];
  }

  return String(assignedGroupIds)
    .split(',')
    .map((groupId) => toInt(groupId.trim()))
    .filter((groupId) => groupId !== null);
}

export function normalizeAssignmentContext(data = {}) {
  return {
    zones: Array.isArray(data.zones) ? data.zones : [],
    items: Array.isArray(data.items) ? data.items : [],
    groups: Array.isArray(data.groups) ? data.groups : []
  };
}

export function buildSequencePayload(updates = []) {
  return {
    sequence: updates.map((update) => ({
      item_id: update.id,
      order: update.item_order
    }))
  };
}

export function buildZoneOptions(zones = []) {
  return zones.map((zone) => ({
    value: zone.id,
    label: zone.name || zone.label || zone.id
  }));
}

export function buildZoneSequence(zoneId, context = {}) {
  const zones = Array.isArray(context.zones) ? context.zones : [];
  const items = Array.isArray(context.items) ? context.items : [];
  const currentZone = zones.find((zone) => String(zone.id) === String(zoneId));

  if (!currentZone) {
    throw new Error('Selected zone not found in data');
  }

  const groupIds = parseAssignedGroupIds(currentZone.assigned_group_ids);
  const zoneItems = items
    .filter((item) => groupIds.includes(item.group_id))
    .sort((left, right) => (left.item_order || 0) - (right.item_order || 0));

  return {
    zone: currentZone,
    groupIds,
    items: zoneItems
  };
}
