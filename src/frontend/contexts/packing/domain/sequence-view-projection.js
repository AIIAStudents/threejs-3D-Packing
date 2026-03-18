import {
  buildDimensionText,
  buildSelectOptions,
  normalizeArray
} from './packing-view-state.js';
import {
  buildZoneOptions,
  buildZoneSequence
} from './sequence-policy.js';

export function buildZoneSelectorState(zones = []) {
  const zoneOptions = buildZoneOptions(zones);
  return buildSelectOptions(
    zoneOptions,
    (zoneOption) => ({
      value: zoneOption.value,
      label: zoneOption.label
    }),
    'No zones available'
  );
}

export function buildSequenceItemCards(items = [], groups = [], resolveGroupColor = null) {
  const normalizedItems = normalizeArray(items);
  const normalizedGroups = normalizeArray(groups);

  return normalizedItems.map((item, index) => {
    const group = normalizedGroups.find((entry) => entry.id === item.group_id);
    return {
      id: item.id,
      itemId: item.item_id || item.id || 'N/A',
      groupId: item.group_id,
      orderLabel: index + 1,
      dimensionText: buildDimensionText(item),
      groupName: group?.name || 'N/A',
      groupColor: typeof resolveGroupColor === 'function'
        ? resolveGroupColor(item.group_id)
        : '#999999'
    };
  });
}

export function buildSequenceViewState(zoneId, context = {}, resolveGroupColor = null) {
  const zoneSequence = buildZoneSequence(zoneId, context);
  return {
    zone: zoneSequence.zone,
    groupIds: zoneSequence.groupIds,
    itemCount: zoneSequence.items.length,
    itemCards: buildSequenceItemCards(zoneSequence.items, context.groups, resolveGroupColor)
  };
}
