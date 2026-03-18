import {
  addAssignment,
  buildEmptyAssignments,
  buildPreviewValidationAllocations,
  buildServerAssignments,
  buildSubmitValidationAllocations,
  createCandidateAllocation,
  flattenAssignmentsForPersistence,
  flattenLeafRegions,
  isGroupAssigned,
  removeAssignment,
  updateAssignmentValue
} from '../domain/allocation-rules.js';
import { CapacityPolicy } from '../domain/capacity-policy.js';
import { allocationApi } from '../infrastructure/allocation-api.js';
import { allocationStorage } from '../infrastructure/allocation-storage.js';

const FALLBACK_GROUPS = [
  { id: 1, name: '蝢斤? A', color: '#667eea' },
  { id: 2, name: '蝢斤? B', color: '#764ba2' }
];

function loadLocalRegionState() {
  const regionsWithSubdivisions = allocationStorage.loadRegionsWithSubdivisions();
  if (regionsWithSubdivisions) {
    const regions = flattenLeafRegions(regionsWithSubdivisions);
    return {
      regions,
      assignments: buildEmptyAssignments(regions)
    };
  }

  const storedRegions = allocationStorage.loadUsableRegions();
  if (storedRegions) {
    return {
      regions: storedRegions,
      assignments: buildEmptyAssignments(storedRegions)
    };
  }

  const generatedZones = allocationStorage.loadGeneratedZones();
  if (generatedZones) {
    const regions = generatedZones.filter((zone) => zone.type === 'usable');
    return {
      regions,
      assignments: buildEmptyAssignments(regions)
    };
  }

  return {
    regions: [],
    assignments: {}
  };
}

export const assignSpaceService = {
  async loadInitialState() {
    try {
      const data = await allocationApi.loadAssignmentData();
      const regions = data.zones || [];

      return {
        groups: data.groups || [],
        regions,
        items: data.items || [],
        assignments: buildServerAssignments(regions)
      };
    } catch (error) {
      console.error('[AssignSpace] Server load failed, falling back to local load:', error);

      let groups = FALLBACK_GROUPS;
      try {
        groups = await allocationApi.loadGroups();
      } catch (groupError) {
        console.error('Error loading groups:', groupError);
      }

      return {
        groups,
        items: [],
        ...loadLocalRegionState()
      };
    }
  },

  getRegionUsageSnapshot(region, regionAssignments, items) {
    return CapacityPolicy.buildRegionUsageSnapshot(region, regionAssignments, items);
  },

  buildPreviewValidation({ assignments, regions, groups, groupId, regionId, mode, percentageValue, efficiencyFactor }) {
    const candidateAllocation = createCandidateAllocation({
      allocationId: `preview_${Date.now()}`,
      regionId,
      groupId,
      mode,
      percentage: percentageValue,
      notes: ''
    });

    const validation = CapacityPolicy.validate(
      regions,
      groups,
      buildPreviewValidationAllocations(assignments, candidateAllocation),
      { efficiency_factor: efficiencyFactor }
    );

    return {
      validation,
      regionResult: validation.per_region[regionId]
    };
  },

  validateNewAssignment({ assignments, regions, groups, groupId, regionId, mode, percentage, priority, notes, efficiencyFactor }) {
    const candidateAllocation = createCandidateAllocation({
      allocationId: `alloc_${Date.now()}`,
      regionId,
      groupId,
      mode,
      percentage: mode === 'percentage' ? (percentage || 50) : null,
      priority: mode === 'priority_queue' ? (priority || 1) : null,
      notes: notes || ''
    });

    const validation = CapacityPolicy.validate(
      regions,
      groups,
      buildSubmitValidationAllocations(assignments, candidateAllocation),
      { efficiency_factor: efficiencyFactor }
    );

    return {
      validation,
      summary: validation.status === 'error' ? CapacityPolicy.getSummary(validation) : null
    };
  },

  addAssignment(assignments, { regionId, groupId, mode }) {
    return addAssignment(assignments, { regionId, groupId, mode });
  },

  updateAssignmentValue(assignments, regionId, groupId, nextValue) {
    return updateAssignmentValue(assignments, regionId, groupId, nextValue);
  },

  removeAssignment(assignments, regionId, groupId) {
    return removeAssignment(assignments, regionId, groupId);
  },

  isGroupAssigned(assignments, groupId) {
    return isGroupAssigned(assignments, groupId);
  },

  async saveAssignments(assignments) {
    allocationStorage.saveZoneAssignments(assignments);

    try {
      const result = await allocationApi.saveAssignments(
        flattenAssignmentsForPersistence(assignments)
      );

      return { result, savedToApi: true };
    } catch (error) {
      console.warn('API save failed, using local storage fallback:', error);
      return { savedToApi: false, error };
    }
  }
};
