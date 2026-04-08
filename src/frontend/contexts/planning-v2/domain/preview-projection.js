function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function padDisplayIndex(index) {
  return String(index).padStart(2, '0');
}

function isPrimaryStorageZone(zone) {
  const rect = zone?.geometry_2d?.rect;
  if (!rect) {
    return false;
  }

  const width = Math.max(0, (rect.x_max_mm || 0) - (rect.x_min_mm || 0));
  const depth = Math.max(0, (rect.z_max_mm || 0) - (rect.z_min_mm || 0));
  const area = width * depth;
  return width >= 1800 && depth >= 1800 && area >= 4_000_000;
}

function buildDisplayLabels(zones = []) {
  const labels = new Map();
  let storageIndex = 0;
  let mainAisleIndex = 0;
  let subAisleIndex = 0;
  let safetyIndex = 0;

  zones.forEach((zone) => {
    if (!zone?.id) {
      return;
    }

    let nextLabel = zone.label || zone.name || zone.id;
    if (zone.metadata?.preserveLabel) {
      labels.set(zone.id, nextLabel);
      return;
    }

    if (zone.type === 'usable' && isPrimaryStorageZone(zone)) {
      storageIndex += 1;
      nextLabel = `儲位區 ${padDisplayIndex(storageIndex)}`;
    } else if (zone.type === 'usable') {
      nextLabel = '作業區';
    } else if (zone.zoneCategory === 'accessible_path' && zone.subtype === 'main_aisle') {
      mainAisleIndex += 1;
      nextLabel = `主走道 ${mainAisleIndex}`;
    } else if (zone.zoneCategory === 'accessible_path') {
      subAisleIndex += 1;
      nextLabel = `次走道 ${subAisleIndex}`;
    } else if (zone.zoneCategory === 'safety_buffer') {
      safetyIndex += 1;
      nextLabel = `緩衝區 ${safetyIndex}`;
    }

    labels.set(zone.id, nextLabel);
  });

  return labels;
}

function buildViewerZone(zone = {}, displayName) {
  const rect = zone.geometry_2d?.rect;
  if (!rect) {
    return null;
  }

  const width = Math.max(0, (rect.x_max_mm || 0) - (rect.x_min_mm || 0));
  const depth = Math.max(0, (rect.z_max_mm || 0) - (rect.z_min_mm || 0));
  const centerX = (rect.x_min_mm || 0) + (width / 2);
  const centerZ = (rect.z_min_mm || 0) + (depth / 2);

  return {
    id: zone.id,
    name: displayName || zone.label || zone.name || zone.id,
    type: zone.zoneCategory || zone.type,
    subtype: zone.subtype,
    semanticKind: zone.zoneCategory === 'accessible_path'
      ? (zone.subtype === 'main_aisle' ? 'main_aisle' : 'secondary_aisle')
      : zone.zoneCategory === 'safety_buffer'
        ? (zone.subtype === 'shipping_buffer' ? 'shipping_buffer' : 'safety_buffer')
        : zone.metadata?.preferredNearEntry
          ? 'fast_moving_zone'
          : 'storage_zone',
    x: centerX,
    y: centerZ,
    length: width,
    width: depth,
    height: zone.depth || 2400,
    rotation: zone.rotation || 0,
    sourceLabel: zone.label || zone.name || zone.id
  };
}

export function buildPlanningViewerData(candidate = {}) {
  const layoutPlan = candidate.layout_plan || {};
  const containerConfig = candidate.container_config || {};
  const rawZones = normalizeArray(layoutPlan.zones);
  const displayLabels = buildDisplayLabels(rawZones);
  const zones = rawZones
    .map((zone) => buildViewerZone(zone, displayLabels.get(zone.id)))
    .filter(Boolean);

  return {
    container: containerConfig,
    zones,
    items: []
  };
}
