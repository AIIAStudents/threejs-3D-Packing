import {
  buildCuttingJobPayload,
  buildRegionsWithSubdivisions,
  extractUsableRegions,
  flattenLeafRegions,
  getLeafRegionSummary
} from '../domain/region-tree.js';
import {
  applySubdivisionToRegions,
  buildEqualSubdivision,
  buildRatioSubdivision,
  clearRegionSubdivisions,
  findRegionById,
  resetAllSubdivisions,
  validateSubdivision
} from '../domain/subdivision-policy.js';
import { cuttingJobsApi } from '../infrastructure/cutting-jobs-api.js';
import { spacePlanningBridge } from '../infrastructure/space-planning-bridge.js';
import { spaceDesignStorage } from '../infrastructure/space-design-storage.js';

function loadUsableSourceZones() {
  return spacePlanningBridge.getZones() ?? spaceDesignStorage.loadGeneratedZones();
}

export const secondaryRegionEditorService = {
  initializeState() {
    return {
      containerConfig: spaceDesignStorage.loadContainerConfig(),
      originalRegions: extractUsableRegions(loadUsableSourceZones())
    };
  },

  reloadOriginalRegions() {
    return extractUsableRegions(loadUsableSourceZones());
  },

  getLeafRegions(region) {
    return flattenLeafRegions([region]);
  },

  getLeafRegionSummary(region) {
    return getLeafRegionSummary(region);
  },

  buildEqualSubdivision({ region, direction, parts, containerConfig, minRegionSize }) {
    const children = buildEqualSubdivision(region, {
      direction,
      parts,
      defaultDepth: containerConfig?.heightY || 2400
    });

    return validateSubdivision(region, children, minRegionSize);
  },

  buildRatioSubdivision({ region, direction, ratio, containerConfig, minRegionSize }) {
    const children = buildRatioSubdivision(region, {
      direction,
      ratio,
      defaultDepth: containerConfig?.heightY || 2400
    });

    return validateSubdivision(region, children, minRegionSize);
  },

  applySubdivision(originalRegions, regionId, children) {
    const regions = applySubdivisionToRegions(originalRegions, regionId, children);
    return {
      regions,
      selectedRegion: findRegionById(regions, regionId)
    };
  },

  clearSubdivision(originalRegions, regionId) {
    const regions = clearRegionSubdivisions(originalRegions, regionId);
    return {
      regions,
      selectedRegion: findRegionById(regions, regionId)
    };
  },

  resetAllSubdivisions(originalRegions) {
    return resetAllSubdivisions(originalRegions);
  },

  persistEditedRegions(originalRegions) {
    const regionsWithSubdivisions = buildRegionsWithSubdivisions(originalRegions);
    const flatLeaves = flattenLeafRegions(originalRegions);

    spaceDesignStorage.saveUsableRegionsWithSubdivisions(regionsWithSubdivisions);
    spaceDesignStorage.saveUsableRegions(flatLeaves);

    return {
      regionsWithSubdivisions,
      flatLeaves
    };
  },

  submitCuttingJob(containerConfig, flatLeaves) {
    return cuttingJobsApi.create(buildCuttingJobPayload(containerConfig, flatLeaves));
  }
};
