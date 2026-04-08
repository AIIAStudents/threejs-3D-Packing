function cloneAssignment(assignment) {
  if (typeof assignment === 'object' && assignment !== null) {
    return { ...assignment };
  }

  return assignment;
}

function cloneAssignments(assignmentsByRegion = {}) {
  return Object.fromEntries(
    Object.entries(assignmentsByRegion).map(([regionId, assignments]) => [
      regionId,
      (assignments || []).map(cloneAssignment)
    ])
  );
}

function getAssignmentGroupId(assignment) {
  return typeof assignment === 'object' ? assignment.id : assignment;
}

function getAssignmentMode(assignment) {
  return typeof assignment === 'object' ? assignment.mode : 'shared';
}

export function flattenLeafRegions(regions = []) {
  const getLeaves = (region) => {
    if (region?.has_subdivisions && Array.isArray(region.child_regions) && region.child_regions.length > 0) {
      return region.child_regions.flatMap((child) => getLeaves(child));
    }

    return [region];
  };

  return regions.flatMap((region) => getLeaves(region));
}

export function buildAssignmentsFromRegions(regions = [], resolver = () => []) {
  return Object.fromEntries(
    regions.map((region) => [region.id, resolver(region)])
  );
}

export function buildServerAssignments(regions = []) {
  return buildAssignmentsFromRegions(regions, (region) => {
    if (!region?.assigned_group_ids) {
      return [];
    }

    return String(region.assigned_group_ids)
      .split(',')
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id));
  });
}

export function buildEmptyAssignments(regions = []) {
  return buildAssignmentsFromRegions(regions, () => []);
}

export function buildPreviewValidationAllocations(assignmentsByRegion = {}, candidateAllocation) {
  const allocations = [];

  for (const regionId in assignmentsByRegion) {
    (assignmentsByRegion[regionId] || []).forEach((assignment) => {
      allocations.push({
        allocation_id: `existing_${regionId}_${assignment}`,
        region_id: regionId,
        group_id: assignment,
        allocation_mode: 'shared',
        amount: {},
        notes: ''
      });
    });
  }

  if (candidateAllocation) {
    allocations.push(candidateAllocation);
  }

  return allocations;
}

export function buildSubmitValidationAllocations(assignmentsByRegion = {}, candidateAllocation) {
  const allocations = [];

  for (const regionId in assignmentsByRegion) {
    (assignmentsByRegion[regionId] || []).forEach((assignment) => {
      const groupId = getAssignmentGroupId(assignment);
      allocations.push({
        allocation_id: `existing_${regionId}_${groupId}`,
        region_id: regionId,
        group_id: groupId,
        allocation_mode: getAssignmentMode(assignment),
        amount: {},
        notes: ''
      });
    });
  }

  if (candidateAllocation) {
    allocations.push(candidateAllocation);
  }

  return allocations;
}

export function createCandidateAllocation({ allocationId, regionId, groupId, mode, percentage, priority, notes = '' }) {
  const allocation = {
    allocation_id: allocationId,
    region_id: regionId,
    group_id: groupId,
    allocation_mode: mode,
    amount: {},
    notes
  };

  if (mode === 'percentage' && percentage) {
    allocation.amount.percent_of_region = parseFloat(percentage) / 100;
  } else if (mode === 'priority_queue' && priority) {
    allocation.amount.priority = parseInt(priority, 10);
  }

  return allocation;
}

export function createStoredAssignment({ groupId, mode }) {
  return {
    id: groupId,
    mode,
    value: mode === 'percentage' ? 50 : (mode === 'priority_queue' ? 1 : null)
  };
}

export function addAssignment(assignmentsByRegion = {}, { regionId, groupId, mode }) {
  const nextAssignments = cloneAssignments(assignmentsByRegion);

  if (!nextAssignments[regionId]) {
    nextAssignments[regionId] = [];
  }

  if (nextAssignments[regionId].some((assignment) => getAssignmentGroupId(assignment) === groupId)) {
    return { assignments: nextAssignments, added: false };
  }

  nextAssignments[regionId].push(createStoredAssignment({ groupId, mode }));

  return {
    assignments: mode === 'percentage'
      ? rebalancePercentages(nextAssignments, regionId)
      : nextAssignments,
    added: true
  };
}

export function rebalancePercentages(assignmentsByRegion = {}, regionId, fixedGroupId = null, fixedValue = null) {
  const nextAssignments = cloneAssignments(assignmentsByRegion);
  const regionAssignments = nextAssignments[regionId];

  if (!regionAssignments) {
    return nextAssignments;
  }

  const percentGroups = regionAssignments.filter(
    (assignment) => typeof assignment === 'object' && assignment.mode === 'percentage'
  );

  if (percentGroups.length === 0) {
    return nextAssignments;
  }

  if (fixedGroupId !== null) {
    const target = percentGroups.find((assignment) => assignment.id === fixedGroupId);
    if (target) {
      target.value = fixedValue;
      target.isLocked = true;
    }
  }

  const lockedGroups = percentGroups.filter((assignment) => assignment.isLocked);
  const unlockedGroups = percentGroups.filter((assignment) => !assignment.isLocked);
  let lockedTotal = lockedGroups.reduce((sum, assignment) => sum + (assignment.value || 0), 0);

  if (lockedTotal >= 100 && unlockedGroups.length > 0) {
    lockedGroups.forEach((assignment) => {
      assignment.isLocked = false;
    });
    lockedTotal = 0;
    unlockedGroups.push(...lockedGroups);
  }

  if (unlockedGroups.length > 0) {
    const remaining = Math.max(0, 100 - lockedTotal);
    const share = parseFloat((remaining / unlockedGroups.length).toFixed(1));
    unlockedGroups.forEach((assignment) => {
      assignment.value = share;
    });
  }

  return nextAssignments;
}

export function updateAssignmentValue(assignmentsByRegion = {}, regionId, groupId, nextValue) {
  const nextAssignments = cloneAssignments(assignmentsByRegion);
  const regionAssignments = nextAssignments[regionId];

  if (!regionAssignments) {
    return nextAssignments;
  }

  const assignment = regionAssignments.find(
    (entry) => getAssignmentGroupId(entry) === groupId
  );

  if (!assignment || typeof assignment !== 'object') {
    return nextAssignments;
  }

  if (assignment.mode === 'percentage') {
    return rebalancePercentages(nextAssignments, regionId, groupId, nextValue);
  }

  assignment.value = nextValue;
  return nextAssignments;
}

export function syncRegionAssignmentMode(assignmentsByRegion = {}, regionId, mode = 'shared') {
  const nextAssignments = cloneAssignments(assignmentsByRegion);
  const regionAssignments = nextAssignments[regionId] || [];

  nextAssignments[regionId] = regionAssignments.map((assignment, index) => {
    const nextAssignment = typeof assignment === 'object'
      ? { ...assignment }
      : { id: assignment };

    nextAssignment.mode = mode;

    if (mode === 'percentage') {
      nextAssignment.value = typeof nextAssignment.value === 'number' ? nextAssignment.value : 0;
      return nextAssignment;
    }

    if (mode === 'priority_queue') {
      nextAssignment.value = index + 1;
      return nextAssignment;
    }

    nextAssignment.value = null;
    delete nextAssignment.isLocked;
    return nextAssignment;
  });

  if (mode === 'percentage') {
    return rebalancePercentages(nextAssignments, regionId);
  }

  return nextAssignments;
}

export function removeAssignment(assignmentsByRegion = {}, regionId, groupId) {
  const nextAssignments = cloneAssignments(assignmentsByRegion);

  if (!nextAssignments[regionId]) {
    return nextAssignments;
  }

  nextAssignments[regionId] = nextAssignments[regionId].filter(
    (assignment) => getAssignmentGroupId(assignment) !== groupId
  );

  const priorityAssignments = nextAssignments[regionId].filter(
    (assignment) => typeof assignment === 'object' && assignment.mode === 'priority_queue'
  );
  if (priorityAssignments.length === nextAssignments[regionId].length) {
    priorityAssignments.forEach((assignment, index) => {
      assignment.value = index + 1;
    });
  }

  return rebalancePercentages(nextAssignments, regionId);
}

export function isGroupAssigned(assignmentsByRegion = {}, groupId) {
  return Object.values(assignmentsByRegion).some((assignments) =>
    (assignments || []).some((assignment) => getAssignmentGroupId(assignment) === groupId)
  );
}

export function flattenAssignmentsForPersistence(assignmentsByRegion = {}) {
  const flatAssignments = [];

  for (const [zoneId, assignments] of Object.entries(assignmentsByRegion)) {
    for (const assignment of assignments || []) {
      flatAssignments.push({
        zone_id: parseInt(zoneId, 10),
        group_id: getAssignmentGroupId(assignment)
      });
    }
  }

  return flatAssignments;
}
