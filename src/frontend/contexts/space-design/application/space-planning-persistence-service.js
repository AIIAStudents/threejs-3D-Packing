import { buildCuttingJobPayload } from '../domain/region-tree.js';
import {
  extractConstraintZones,
  extractUsableRegions,
  hasUsableRegions
} from '../domain/usable-region-policy.js';
import { cuttingJobsApi } from '../infrastructure/cutting-jobs-api.js';
import { spaceDesignStorage } from '../infrastructure/space-design-storage.js';

export const spacePlanningPersistenceService = {
  loadInitialState(defaultConstraints) {
    const savedConstraints = spaceDesignStorage.loadSpaceConstraints();

    return {
      hasSavedConstraints: Boolean(savedConstraints),
      containerConfig: spaceDesignStorage.loadContainerConfig(),
      constraints: savedConstraints
        ? { ...defaultConstraints, ...savedConstraints }
        : defaultConstraints
    };
  },

  clearGeneratedZones() {
    return spaceDesignStorage.clearGeneratedZones();
  },

  persistGeneratedLayout({ layoutPlan, constraints, zones, containerConfig }) {
    const defaultDepth = containerConfig?.heightY || 2400;
    const usableRegions = extractUsableRegions(zones, { defaultDepth });
    const constraintZones = extractConstraintZones(zones, { defaultDepth });

    spaceDesignStorage.saveLayoutPlan(layoutPlan);
    spaceDesignStorage.saveSpaceConstraints(constraints);
    spaceDesignStorage.saveGeneratedZones(zones);
    spaceDesignStorage.saveUsableRegions(usableRegions);
    spaceDesignStorage.saveConstraintZones(constraintZones);

    return {
      usableRegions,
      constraintZones
    };
  },

  hasEditableRegions(zones) {
    return hasUsableRegions(zones);
  },

  submitCuttingJob(containerConfig, usableRegions) {
    return cuttingJobsApi.create(buildCuttingJobPayload(containerConfig, usableRegions));
  }
};
