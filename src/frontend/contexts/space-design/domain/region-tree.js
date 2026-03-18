import { extractUsableRegions, normalizeRegion, normalizeRegionCollection } from './usable-region-policy.js';
export { extractUsableRegions } from './usable-region-policy.js';

function collectLeafRegions(region, leaves) {
  const childRegions = Array.isArray(region?.child_regions) ? region.child_regions : [];
  const hasSubdivisions = Boolean(region?.has_subdivisions) && childRegions.length > 0;

  if (!hasSubdivisions) {
    leaves.push(normalizeRegion(region));
    return;
  }

  childRegions.forEach((childRegion) => collectLeafRegions(childRegion, leaves));
}

export function flattenLeafRegions(regions = []) {
  const leaves = [];
  regions.forEach((region) => collectLeafRegions(region, leaves));
  return leaves;
}

export function buildRegionsWithSubdivisions(regions = []) {
  return normalizeRegionCollection(regions);
}

export function getLeafRegionsForRegion(region) {
  return flattenLeafRegions([region]);
}

export function getLeafRegionSummary(region) {
  const leafRegions = getLeafRegionsForRegion(region);
  return {
    leafRegions,
    totalLeafArea: leafRegions.reduce((sum, childRegion) => sum + (childRegion.area || 0), 0)
  };
}

export function buildCuttingJobPayload(containerConfig, regions = []) {
  if (!containerConfig) {
    throw new Error('Container configuration is missing');
  }

  return {
    container: containerConfig,
    zones: regions.map((region) => ({
      label: region.name || region.label,
      length: region.width,
      width: region.height,
      height: region.depth || containerConfig.heightY || 2400,
      x: region.x,
      y: region.y,
      rotation: region.rotation || 0
    }))
  };
}
