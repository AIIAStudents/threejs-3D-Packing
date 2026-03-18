import { CapacityChecker } from '../../../../js_v2/assign/capacity_checker.js';

function calculateAssignedGroupVolumeMm3(items = [], assignments = []) {
  return assignments.reduce((total, assignment) => {
    const groupId = typeof assignment === 'object' ? assignment.id : assignment;
    const groupItems = items.filter((item) => parseInt(item.group_id, 10) === parseInt(groupId, 10));

    return total + groupItems.reduce(
      (groupTotal, item) => groupTotal + ((item.length || 0) * (item.width || 0) * (item.height || 0)),
      0
    );
  }, 0);
}

function getRegionVolumeMm3(region) {
  const metrics = region?.metrics || {};

  if (metrics.volume_mm3) {
    return metrics.volume_mm3;
  }

  return (region?.length || 0) * (region?.width || 0) * (region?.height || 0);
}

function getUtilizationStatus(utilization) {
  if (utilization >= 80) {
    return 'error';
  }

  if (utilization >= 50) {
    return 'warning';
  }

  return 'ok';
}

export const CapacityPolicy = {
  validate(regions, groups, allocations, options = {}) {
    return CapacityChecker.validate(regions, groups, allocations, options);
  },

  getSummary(validationResult) {
    return CapacityChecker.getSummary(validationResult);
  },

  buildRegionUsageSnapshot(region, assignments, items = []) {
    const metrics = region?.metrics || {};
    const areaM2 = metrics.area_m2 || (((region?.length || 0) * (region?.width || 0)) / 1000000);
    const regionVolumeMm3 = getRegionVolumeMm3(region);
    const totalGroupVolumeMm3 = calculateAssignedGroupVolumeMm3(items, assignments);
    const utilization = regionVolumeMm3 > 0 ? ((totalGroupVolumeMm3 / regionVolumeMm3) * 100) : 0;

    return {
      areaM2,
      volumeM3: regionVolumeMm3 / 1e9,
      utilization,
      status: getUtilizationStatus(utilization)
    };
  }
};
