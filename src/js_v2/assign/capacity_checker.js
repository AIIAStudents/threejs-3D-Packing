/**
 * Capacity Checking Engine
 * Validates allocation feasibility based on region capacity and group demands
 */

export const CapacityChecker = {
  // Default packing efficiency factor (85%)
  DEFAULT_EFFICIENCY: 0.85,

  /**
   * Check if allocations are feasible
   * @param {Array} regions - Usable regions with metrics
   * @param {Array} groups - Item groups with demand metrics
   * @param {Array} allocations - Allocation records
   * @param {Object} options - { efficiency_factor }
   * @returns {Object} Validation result
   */
  validate(regions, groups, allocations, options = {}) {
    const efficiency = options.efficiency_factor || this.DEFAULT_EFFICIENCY;

    const result = {
      status: 'ok', // 'ok' | 'warning' | 'error'
      per_region: {},
      per_group: {},
      global: {
        unassigned_groups: [],
        unused_regions: []
      },
      messages: []
    };

    // Per-region checks
    regions.forEach(region => {
      result.per_region[region.id] = this.checkRegionCapacity(
        region,
        groups,
        allocations.filter(a => a.region_id === region.id),
        efficiency
      );

      if (result.per_region[region.id].status === 'error') {
        result.status = 'error';
      } else if (result.per_region[region.id].status === 'warning' && result.status === 'ok') {
        result.status = 'warning';
      }
    });

    // Per-group checks
    groups.forEach(group => {
      result.per_group[group.id] = this.checkGroupConstraints(
        group,
        regions,
        allocations.filter(a => a.group_id === group.id)
      );

      if (result.per_group[group.id].status === 'error') {
        result.status = 'error';
      } else if (result.per_group[group.id].status === 'warning' && result.status === 'ok') {
        result.status = 'warning';
      }
    });

    // Global checks
    const assignedGroupIds = new Set(allocations.map(a => a.group_id));
    result.global.unassigned_groups = groups
      .filter(g => !assignedGroupIds.has(g.id))
      .map(g => g.id);

    const usedRegionIds = new Set(allocations.map(a => a.region_id));
    result.global.unused_regions = regions
      .filter(r => !usedRegionIds.has(r.id))
      .map(r => r.id);

    if (result.global.unassigned_groups.length > 0) {
      result.messages.push(`有 ${result.global.unassigned_groups.length} 個群組尚未分配`);
      if (result.status === 'ok') result.status = 'warning';
    }

    return result;
  },

  /**
   * Check region capacity
   */
  checkRegionCapacity(region, allGroups, regionAllocations, efficiency) {
    const result = {
      status: 'ok',
      overage_ratio: 0,
      messages: []
    };

    if (regionAllocations.length === 0) {
      return result;
    }

    // Check exclusive mode conflict
    const exclusiveAllocs = regionAllocations.filter(a => a.allocation_mode === 'exclusive');
    if (exclusiveAllocs.length > 0 && regionAllocations.length > 1) {
      result.status = 'error';
      result.messages.push('區域已設為獨占模式，無法再分配其他群組');
      return result;
    }

    // Check percentage consistency
    const percentageAllocs = regionAllocations.filter(a => a.allocation_mode === 'percentage');
    if (percentageAllocs.length > 0) {
      const totalPercent = percentageAllocs.reduce((sum, a) => {
        return sum + (a.amount?.percent_of_region || 0);
      }, 0);

      if (totalPercent > 1.0) {
        result.status = 'error';
        result.overage_ratio = totalPercent - 1.0;
        result.messages.push(`百分比分配總和超出 ${(totalPercent * 100).toFixed(1)}% > 100%`);
        return result;
      } else if (totalPercent > 0.95) {
        result.status = 'warning';
        result.messages.push(`百分比分配接近上限 ${(totalPercent * 100).toFixed(1)}%`);
      }
    }

    // Check volume capacity
    let regionVolume = region.metrics?.volume_mm3 || 0;
    
    // Fallback to dimensions if metrics are missing
    if (regionVolume === 0 && region.length && region.width && region.height) {
      regionVolume = region.length * region.width * region.height;
    }
    
    const availableVolume = regionVolume * efficiency;

    let totalDemandVolume = 0;
    regionAllocations.forEach(alloc => {
      const group = allGroups.find(g => g.id === alloc.group_id);
      if (group && group.demand_metrics) {
        if (alloc.allocation_mode === 'percentage') {
          totalDemandVolume += group.demand_metrics.total_volume_mm3 * (alloc.amount?.percent_of_region || 1);
        } else {
          totalDemandVolume += group.demand_metrics.total_volume_mm3;
        }
      }
    });

    if (totalDemandVolume > availableVolume) {
      result.status = 'error';
      result.overage_ratio = (totalDemandVolume - availableVolume) / availableVolume;
      result.messages.push(
        `容量超出 ${(result.overage_ratio * 100).toFixed(1)}%（需求: ${(totalDemandVolume / 1e9).toFixed(2)} m³, 可用: ${(availableVolume / 1e9).toFixed(2)} m³）`
      );
    } else if (totalDemandVolume > availableVolume * 0.9) {
      result.status = 'warning';
      const utilization = (totalDemandVolume / availableVolume * 100).toFixed(1);
      result.messages.push(`容量使用率較高 ${utilization}%`);
    }

    return result;
  },

  /**
   * Check group constraints
   */
  checkGroupConstraints(group, allRegions, groupAllocations) {
    const result = {
      status: 'ok',
      messages: []
    };

    if (groupAllocations.length === 0) {
      return result;
    }

    // Check must_be_in_single_region constraint
    if (group.constraints?.must_be_in_single_region && groupAllocations.length > 1) {
      result.status = 'error';
      result.messages.push('群組必須在單一區域，但目前分配到多個區域');
      return result;
    }

    // Check forbidden regions
    if (group.constraints?.forbidden_region_ids) {
      const forbiddenIds = new Set(group.constraints.forbidden_region_ids);
      const violatingAllocs = groupAllocations.filter(a => forbiddenIds.has(a.region_id));

      if (violatingAllocs.length > 0) {
        result.status = 'error';
        result.messages.push('群組被分配到禁止的區域');
        return result;
      }
    }

    // Check preferred regions (warning only)
    if (group.constraints?.preferred_region_ids && group.constraints.preferred_region_ids.length > 0) {
      const preferredIds = new Set(group.constraints.preferred_region_ids);
      const hasPreferred = groupAllocations.some(a => preferredIds.has(a.region_id));

      if (!hasPreferred) {
        result.status = 'warning';
        result.messages.push('群組未分配到偏好的區域');
      }
    }

    return result;
  },

  /**
   * Get human-readable summary of validation result
   */
  getSummary(validationResult) {
    const summary = {
      overall_status: validationResult.status,
      error_count: 0,
      warning_count: 0,
      details: []
    };

    // Count errors and warnings
    Object.values(validationResult.per_region).forEach(r => {
      if (r.status === 'error') summary.error_count++;
      else if (r.status === 'warning') summary.warning_count++;
    });

    Object.values(validationResult.per_group).forEach(g => {
      if (g.status === 'error') summary.error_count++;
      else if (g.status === 'warning') summary.warning_count++;
    });

    // Collect all messages
    Object.entries(validationResult.per_region).forEach(([regionId, result]) => {
      if (result.messages.length > 0) {
        summary.details.push({
          type: 'region',
          id: regionId,
          status: result.status,
          messages: result.messages
        });
      }
    });

    Object.entries(validationResult.per_group).forEach(([groupId, result]) => {
      if (result.messages.length > 0) {
        summary.details.push({
          type: 'group',
          id: groupId,
          status: result.status,
          messages: result.messages
        });
      }
    });

    // Add global messages
    if (validationResult.messages.length > 0) {
      summary.details.push({
        type: 'global',
        status: validationResult.status,
        messages: validationResult.messages
      });
    }

    return summary;
  }
};
