function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUtilization(rawUtilization) {
  const utilization = Number(rawUtilization) || 0;
  return utilization <= 1 ? utilization * 100 : utilization;
}

function buildZoneTransform(zone = {}) {
  return {
    cx: zone.x || 0,
    cy: zone.y || 0,
    rotation: zone.rotation || 0,
    width: zone.length || 0,
    depth: zone.width || 0
  };
}

function normalizeItemPackedStatus(item = {}) {
  return item.packed !== false && (
    item.packed === true ||
    item.is_packed === true ||
    item.x !== undefined ||
    item.position?.x !== undefined
  );
}

export function summarizePackingResult(result = {}) {
  const packedCount = result.packed_count || 0;
  const unpackedCount = result.unpacked_count || 0;
  const totalCount = packedCount + unpackedCount;
  const utilizationPercent = normalizeUtilization(result.volume_utilization || 0);
  const progressPercent = totalCount > 0 ? (packedCount / totalCount) * 100 : 0;

  return {
    packedCount,
    unpackedCount,
    totalCount,
    utilizationPercent,
    progressPercent,
    executionTimeMs: result.execution_time_ms || 0,
    success: result.success !== false
  };
}

export function buildLatestPackingProjection(data = {}) {
  const spaces = normalizeArray(data.spaces);

  if (spaces.length > 0) {
    const firstSpace = spaces[0];
    return {
      fullData: data,
      packingResult: {
        job_id: data.job_id,
        success: true,
        packed_count: data.total_packed || 0,
        unpacked_count: data.total_unpacked || 0,
        volume_utilization: firstSpace.result?.volume_utilization || 0,
        execution_time_ms: data.total_execution_time || 0,
        zone_label: firstSpace.zone_label,
        container: data.container || firstSpace.result?.container || {},
        zones: data.zones || [],
        items: firstSpace.result?.items || []
      }
    };
  }

  return {
    fullData: data,
    packingResult: data
  };
}

export function buildSpacePackingProjection(spaceData = {}) {
  return {
    zone_id: spaceData.zone_id,
    zone_label: spaceData.zone_label,
    packed_count: spaceData.packed_count || 0,
    unpacked_count: spaceData.unpacked_count || 0,
    volume_utilization: spaceData.volume_utilization || 0,
    execution_time_ms: spaceData.execution_time_ms || 0,
    container: spaceData.result?.container || {},
    items: spaceData.result?.items || [],
    zones: spaceData.result?.zones || []
  };
}

export function buildViewerPackingData(packingResult = {}, fullData = {}, resolveColor = null) {
  const zones = normalizeArray(packingResult.zones || fullData.zones);
  const spaces = normalizeArray(fullData.spaces);
  const zoneOffsetMap = Object.fromEntries(
    zones.map((zone) => [zone.id, buildZoneTransform(zone)])
  );

  const items = [];
  spaces.forEach((space) => {
    if (!space.result?.items) {
      return;
    }

    const zoneTransform = zoneOffsetMap[space.zone_id] || buildZoneTransform();
    space.result.items.forEach((item) => {
      const nextItem = { ...item, zoneTransform };
      if (typeof resolveColor === 'function') {
        nextItem.color = resolveColor(nextItem.group_id);
      }
      items.push(nextItem);
    });
  });

  return {
    container: packingResult.container || fullData.container || {},
    items,
    zones
  };
}

export function buildAnimationPackingData(data = {}) {
  const zones = normalizeArray(data.zones);
  const zoneById = Object.fromEntries(zones.map((zone) => [String(zone.id), zone]));
  const spaces = normalizeArray(data.spaces);
  const items = [];

  spaces.forEach((space) => {
    if (!space.result?.items) {
      return;
    }

    const zone = zoneById[String(space.zone_id)];
    const zoneTransform = buildZoneTransform(zone);

    space.result.items
      .filter((item) => normalizeItemPackedStatus(item))
      .forEach((item) => {
        items.push({
          ...item,
          zoneTransform
        });
      });
  });

  const firstSpaceResult = spaces[0]?.result;
  const rawUtilization = firstSpaceResult?.volume_utilization ??
    firstSpaceResult?.metrics?.utilization ??
    0;

  return {
    container: data.container || {},
    zones,
    items,
    totalItems: items.length,
    utilization: normalizeUtilization(rawUtilization)
  };
}

export function filterPackingItems(items = [], { filterType = 'all', searchQuery = '' } = {}) {
  let filteredItems = normalizeArray(items);

  if (filterType === 'packed') {
    filteredItems = filteredItems.filter((item) => normalizeItemPackedStatus(item));
  } else if (filterType === 'unpacked') {
    filteredItems = filteredItems.filter((item) => !normalizeItemPackedStatus(item));
  }

  if (searchQuery) {
    const normalizedQuery = String(searchQuery).toLowerCase();
    filteredItems = filteredItems.filter((item) =>
      String(item.item_id || '').toLowerCase().includes(normalizedQuery)
    );
  }

  return filteredItems;
}
