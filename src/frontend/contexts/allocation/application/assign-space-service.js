import {
  addAssignment,
  buildEmptyAssignments,
  buildServerAssignments,
  flattenAssignmentsForPersistence,
  flattenLeafRegions,
  isGroupAssigned,
  removeAssignment,
  syncRegionAssignmentMode,
  updateAssignmentValue
} from '../domain/allocation-rules.js';
import { CapacityPolicy } from '../domain/capacity-policy.js';
import {
  buildAllocationWorkspaceState,
  evaluateAssignmentAttempt,
  getPolicySummary,
  normalizeSpacePolicy
} from '../domain/space-allocation-policy.js';
import { allocationApi } from '../infrastructure/allocation-api.js';
import { allocationStorage } from '../infrastructure/allocation-storage.js';

const FALLBACK_GROUPS = [
  { id: 1, name: '群組 A', color: '#667eea' },
  { id: 2, name: '群組 B', color: '#764ba2' }
];

function normalizeAssignments(assignments = {}, regions = []) {
  const nextAssignments = { ...assignments };

  regions.forEach((region) => {
    if (!Array.isArray(nextAssignments[region.id])) {
      nextAssignments[region.id] = [];
    }
  });

  return nextAssignments;
}

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
  if (generatedZones?.length) {
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

function mergeRegionGeometry(primaryRegions = [], fallbackRegions = []) {
  if (!fallbackRegions?.length) {
    return primaryRegions;
  }

  const fallbackByLabel = new Map(
    fallbackRegions.map((region) => [String(region.label || region.name || region.id), region])
  );

  return primaryRegions.map((region) => {
    const fallback = fallbackByLabel.get(String(region.label || region.name || region.id));
    if (!fallback) {
      return region;
    }

    return {
      ...fallback,
      ...region,
      width: fallback.width || region.width,
      height: fallback.height || region.length || region.height,
      depth: fallback.depth || region.height,
      metrics: {
        ...(fallback.metrics || {}),
        ...(region.metrics || {})
      },
      geometry_2d: region.geometry_2d || fallback.geometry_2d,
      depth: region.depth || fallback.depth
    };
  });
}

export const assignSpaceService = {
  async loadInitialState() {
    const localRegions = allocationStorage.loadUsableRegions() || [];
    const generatedZones = allocationStorage.loadGeneratedZones() || [];
    const constraintZones = allocationStorage.loadConstraintZones() || generatedZones.filter((zone) => zone.type !== 'usable');
    const storedAssignments = allocationStorage.loadZoneAssignments?.() || {};
    const storedPolicies = allocationStorage.loadSpacePolicies();

    try {
      const data = await allocationApi.loadAssignmentData();
      const serverRegions = data.zones || [];
      const mergedRegions = mergeRegionGeometry(serverRegions, localRegions);
      const assignments = normalizeAssignments(
        Object.keys(storedAssignments).length
          ? storedAssignments
          : buildServerAssignments(mergedRegions),
        mergedRegions
      );

      return {
        groups: data.groups || [],
        regions: mergedRegions,
        items: data.items || [],
        assignments,
        constraintZones,
        spacePolicies: storedPolicies || {}
      };
    } catch (error) {
      console.error('[AssignSpace] Server load failed, falling back to local load:', error);

      let groups = FALLBACK_GROUPS;
      try {
        groups = await allocationApi.loadGroups();
      } catch (groupError) {
        console.error('Error loading groups:', groupError);
      }

      const localState = loadLocalRegionState();
      return {
        groups,
        items: [],
        regions: localState.regions,
        assignments: normalizeAssignments(
          Object.keys(storedAssignments).length ? storedAssignments : localState.assignments,
          localState.regions
        ),
        constraintZones,
        spacePolicies: storedPolicies || {}
      };
    }
  },

  buildWorkspaceState({ regions, groups, items, assignments, spacePolicies, constraintZones, selectedGroupId }) {
    return buildAllocationWorkspaceState({
      regions,
      groups,
      items,
      assignments,
      spacePolicies,
      constraintZones,
      selectedGroupId
    });
  },

  getRegionUsageSnapshot(region, regionAssignments, items) {
    return CapacityPolicy.buildRegionUsageSnapshot(region, regionAssignments, items);
  },

  updateSpacePolicy(spacePolicies = {}, assignments = {}, region, patch = {}) {
    const currentPolicy = normalizeSpacePolicy(spacePolicies?.[region.id], region?.spatial);
    const nextPolicy = normalizeSpacePolicy({ ...currentPolicy, ...patch }, region?.spatial);
    const nextPolicies = {
      ...spacePolicies,
      [region.id]: nextPolicy
    };

    let nextAssignments = assignments;
    if (patch.mode && patch.mode !== currentPolicy.mode) {
      nextAssignments = syncRegionAssignmentMode(assignments, region.id, nextPolicy.mode);
    }

    return {
      spacePolicies: nextPolicies,
      assignments: nextAssignments,
      policy: nextPolicy
    };
  },

  buildPolicySummary(policy) {
    return getPolicySummary(policy);
  },

  validateAssignmentAttempt({ region, group, assignments, items }) {
    return evaluateAssignmentAttempt({
      region,
      groupProfile: group,
      assignments,
      items
    });
  },

  assignGroup(assignments, { region, group }) {
    return addAssignment(assignments, {
      regionId: region.id,
      groupId: group.id,
      mode: region.spacePolicy.mode
    });
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

  async saveWorkspace({ assignments, spacePolicies }) {
    allocationStorage.saveZoneAssignments(assignments);
    allocationStorage.saveSpacePolicies(spacePolicies);

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
