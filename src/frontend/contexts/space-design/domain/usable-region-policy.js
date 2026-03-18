const DEFAULT_DEPTH_MM = 2400;

function toNumber(value, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function normalizeMetrics(region, width, height, depth) {
  const areaM2 = width > 0 && height > 0
    ? Math.round(((width * height) / 1000000) * 100) / 100
    : 0;
  const volumeMm3 = width > 0 && height > 0 && depth > 0
    ? width * height * depth
    : 0;

  return {
    area_m2: toNumber(region?.metrics?.area_m2, areaM2),
    volume_mm3: toNumber(region?.metrics?.volume_mm3, volumeMm3),
    max_span_x_mm: toNumber(region?.metrics?.max_span_x_mm, width),
    max_span_z_mm: toNumber(region?.metrics?.max_span_z_mm, height)
  };
}

export function normalizeRegion(region, options = {}) {
  const defaultDepth = toNumber(options.defaultDepth, DEFAULT_DEPTH_MM);
  const width = toNumber(region?.width);
  const height = toNumber(region?.height);
  const depth = toNumber(region?.depth, defaultDepth);
  const childRegions = Array.isArray(region?.child_regions)
    ? region.child_regions.map((childRegion) => normalizeRegion(childRegion, { defaultDepth: depth }))
    : [];
  const metrics = normalizeMetrics(region, width, height, depth);
  const area = toNumber(region?.area, metrics.area_m2);
  const geometryRect = region?.geometry_2d?.rect ?? {
    x_min_mm: toNumber(region?.x) - (width / 2),
    x_max_mm: toNumber(region?.x) + (width / 2),
    z_min_mm: toNumber(region?.y) - (height / 2),
    z_max_mm: toNumber(region?.y) + (height / 2)
  };

  return {
    ...region,
    width,
    height,
    depth,
    area,
    metrics,
    child_regions: childRegions,
    has_subdivisions: childRegions.length > 0 || Boolean(region?.has_subdivisions),
    geometry_2d: region?.geometry_2d ?? {
      kind: 'rect',
      rect: geometryRect
    },
    height_policy: region?.height_policy ?? {
      mode: 'inherit_container',
      y_mm: depth
    }
  };
}

export function normalizeRegionCollection(regions = [], options = {}) {
  return regions.map((region) => normalizeRegion(region, options));
}

export function extractUsableRegions(zones = [], options = {}) {
  return normalizeRegionCollection(
    zones.filter((zone) => zone?.type === 'usable'),
    options
  );
}

export function extractConstraintZones(zones = [], options = {}) {
  return normalizeRegionCollection(
    zones.filter((zone) => zone?.type !== 'usable'),
    options
  );
}

export function hasUsableRegions(zones = []) {
  return zones.some((zone) => zone?.type === 'usable');
}
