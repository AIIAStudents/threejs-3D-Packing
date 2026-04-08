function toNumber(value, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getRect(entity = {}) {
  const geometryRect = entity?.geometry_2d?.rect;
  if (geometryRect) {
    return {
      xMin: toNumber(geometryRect.x_min_mm),
      xMax: toNumber(geometryRect.x_max_mm),
      yMin: toNumber(geometryRect.z_min_mm),
      yMax: toNumber(geometryRect.z_max_mm)
    };
  }

  const width = toNumber(entity.width);
  const height = toNumber(entity.length, toNumber(entity.height));
  const centerX = toNumber(entity.x);
  const centerY = toNumber(entity.y);

  return {
    xMin: centerX - (width / 2),
    xMax: centerX + (width / 2),
    yMin: centerY - (height / 2),
    yMax: centerY + (height / 2)
  };
}

function rectWidth(rect) {
  return Math.max(0, rect.xMax - rect.xMin);
}

function rectHeight(rect) {
  return Math.max(0, rect.yMax - rect.yMin);
}

function rectArea(rect) {
  return rectWidth(rect) * rectHeight(rect);
}

function rectCenter(rect) {
  return {
    x: (rect.xMin + rect.xMax) / 2,
    y: (rect.yMin + rect.yMax) / 2
  };
}

function distancePointToRect(point, rect) {
  const dx = Math.max(rect.xMin - point.x, 0, point.x - rect.xMax);
  const dy = Math.max(rect.yMin - point.y, 0, point.y - rect.yMax);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function distanceRectToRect(a, b) {
  const dx = Math.max(a.xMin - b.xMax, b.xMin - a.xMax, 0);
  const dy = Math.max(a.yMin - b.yMax, b.yMin - a.yMax, 0);
  return Math.sqrt((dx * dx) + (dy * dy));
}

function computeBounds(regions = [], constraintZones = []) {
  const rects = [...regions, ...constraintZones]
    .filter(Boolean)
    .map((entry) => getRect(entry))
    .filter((rect) => Number.isFinite(rect.xMin) && Number.isFinite(rect.xMax));

  if (rects.length === 0) {
    return {
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
      width: 1,
      height: 1
    };
  }

  const xMin = Math.min(...rects.map((rect) => rect.xMin));
  const xMax = Math.max(...rects.map((rect) => rect.xMax));
  const yMin = Math.min(...rects.map((rect) => rect.yMin));
  const yMax = Math.max(...rects.map((rect) => rect.yMax));

  return {
    xMin,
    xMax,
    yMin,
    yMax,
    width: Math.max(1, xMax - xMin),
    height: Math.max(1, yMax - yMin)
  };
}

function quantile(values = [], ratio = 0.5) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function getBand(value, min, max) {
  const span = Math.max(1, max - min);
  const ratio = (value - min) / span;

  if (ratio < 0.34) {
    return 'start';
  }

  if (ratio > 0.66) {
    return 'end';
  }

  return 'middle';
}

function getHorizontalLabel(band) {
  if (band === 'start') return '左側';
  if (band === 'end') return '右側';
  return '中央';
}

function getVerticalLabel(band) {
  if (band === 'start') return '上方';
  if (band === 'end') return '下方';
  return '中段';
}

function getPositionLabel(horizontalBand, verticalBand) {
  const key = `${verticalBand}-${horizontalBand}`;
  const map = {
    'start-start': '左上',
    'start-middle': '上中',
    'start-end': '右上',
    'middle-start': '左側',
    'middle-middle': '中央',
    'middle-end': '右側',
    'end-start': '左下',
    'end-middle': '下中',
    'end-end': '右下'
  };
  return map[key] || '中央';
}

function buildGroupMetrics(group, items = []) {
  const groupItems = items.filter((item) => String(item.group_id) === String(group.id));
  const totalVolumeMm3 = groupItems.reduce((total, item) => {
    return total + (toNumber(item.length) * toNumber(item.width) * toNumber(item.height));
  }, 0);

  return {
    ...group,
    itemCount: groupItems.length,
    totalVolumeMm3,
    totalVolumeM3: totalVolumeMm3 / 1e9,
    items: groupItems
  };
}

function buildGroupProfiles(groups = [], items = []) {
  const summaries = groups.map((group) => buildGroupMetrics(group, items));
  const volumes = summaries.map((summary) => summary.totalVolumeMm3).filter((value) => value > 0);
  const counts = summaries.map((summary) => summary.itemCount).filter((value) => value > 0);
  const volumeSmall = quantile(volumes, 0.33);
  const volumeLarge = quantile(volumes, 0.66);
  const countMedium = quantile(counts, 0.5);
  const countLarge = quantile(counts, 0.66);

  return summaries.map((summary) => {
    let profileKey = 'balanced';
    let profileLabel = '平衡型';
    let accessDemand = 'medium';
    let storageDemand = 'medium';

    if (summary.totalVolumeMm3 >= volumeLarge && volumeLarge > 0) {
      profileKey = 'bulk';
      profileLabel = '大量 / 體積型';
      accessDemand = 'medium';
      storageDemand = 'large';
    } else if (summary.itemCount >= countLarge && countLarge > 0) {
      profileKey = 'fast_pick';
      profileLabel = '高頻 / 快取型';
      accessDemand = 'high';
      storageDemand = 'medium';
    } else if (summary.totalVolumeMm3 <= volumeSmall && summary.itemCount <= Math.max(2, countMedium || 2)) {
      profileKey = 'compact';
      profileLabel = '精簡 / 緊湊型';
      accessDemand = 'medium';
      storageDemand = 'small';
    }

    const tags = [];
    if (profileKey === 'fast_pick') tags.push('高可達需求');
    if (profileKey === 'bulk') tags.push('偏大區塊');
    if (summary.itemCount > 0) tags.push(`${summary.itemCount} 項`);

    return {
      ...summary,
      profileKey,
      profileLabel,
      accessDemand,
      storageDemand,
      tags
    };
  });
}

function buildConstraintContext(regions = [], constraintZones = []) {
  const bounds = computeBounds(regions, constraintZones);
  const mainAisle = constraintZones
    .filter((zone) => zone?.subtype === 'main_aisle')
    .sort((left, right) => rectArea(getRect(right)) - rectArea(getRect(left)))[0] || null;

  const entrance = {
    x: bounds.xMin + (bounds.width / 2),
    y: bounds.yMax
  };

  return {
    bounds,
    mainAisleRect: mainAisle ? getRect(mainAisle) : null,
    entrance
  };
}

function getSizeBand(areaMm2, thresholds) {
  if (areaMm2 >= thresholds.large) {
    return { key: 'large', label: '大型區塊' };
  }

  if (areaMm2 <= thresholds.small) {
    return { key: 'small', label: '緊湊區塊' };
  }

  return { key: 'medium', label: '中型區塊' };
}

function buildRegionSpatialProfile(region, context, sizeThresholds) {
  const rect = getRect(region);
  const center = rectCenter(rect);
  const bounds = context.bounds;
  const horizontalBand = getBand(center.x, bounds.xMin, bounds.xMax);
  const verticalBand = getBand(center.y, bounds.yMin, bounds.yMax);
  const positionLabel = getPositionLabel(horizontalBand, verticalBand);
  const mainAisleDistance = context.mainAisleRect ? distanceRectToRect(rect, context.mainAisleRect) : Number.POSITIVE_INFINITY;
  const entranceDistance = distancePointToRect(context.entrance, rect);
  const boundaryDistance = Math.min(
    Math.abs(rect.xMin - bounds.xMin),
    Math.abs(bounds.xMax - rect.xMax),
    Math.abs(rect.yMin - bounds.yMin),
    Math.abs(bounds.yMax - rect.yMax)
  );

  const nearMainAisle = Number.isFinite(mainAisleDistance) && mainAisleDistance <= Math.max(700, Math.min(rectWidth(rect), rectHeight(rect)) * 0.8);
  const nearEntrance = entranceDistance <= (bounds.height * 0.32);
  const nearBoundary = boundaryDistance <= Math.max(450, Math.min(bounds.width, bounds.height) * 0.08);
  const sizeBand = getSizeBand(rectArea(rect), sizeThresholds);

  let accessClass = 'medium';
  if (nearMainAisle || nearEntrance) {
    accessClass = 'high';
  } else if (!nearBoundary && sizeBand.key === 'large') {
    accessClass = 'low';
  }

  const semanticTags = [
    positionLabel,
    getHorizontalLabel(horizontalBand),
    getVerticalLabel(verticalBand),
    sizeBand.label
  ];

  if (nearMainAisle) semanticTags.push('靠主走道');
  if (nearEntrance) semanticTags.push('靠入口');
  if (nearBoundary) semanticTags.push('靠邊界');
  if (accessClass === 'low') semanticTags.push('深區');

  return {
    rect,
    center,
    positionLabel,
    horizontalBand,
    verticalBand,
    mainAisleDistance,
    entranceDistance,
    boundaryDistance,
    nearMainAisle,
    nearEntrance,
    nearBoundary,
    accessClass,
    sizeBand,
    semanticTags: Array.from(new Set(semanticTags))
  };
}

function buildDefaultSpacePolicy(spatialProfile) {
  const exclusiveDefault = spatialProfile.sizeBand.key === 'large' && spatialProfile.accessClass !== 'high';
  const allowedGroupProfiles = exclusiveDefault
    ? ['bulk', 'balanced']
    : spatialProfile.accessClass === 'high'
      ? ['fast_pick', 'balanced', 'compact']
      : ['balanced', 'compact', 'bulk'];

  return {
    mode: exclusiveDefault ? 'exclusive' : 'shared',
    maxGroups: exclusiveDefault ? 1 : (spatialProfile.accessClass === 'high' ? 4 : 3),
    maxUtilizationPercent: spatialProfile.accessClass === 'high' ? 78 : 85,
    allowedGroupProfiles,
    notes: '',
    slottingIntent: spatialProfile.accessClass === 'high' ? 'quick_pick' : (exclusiveDefault ? 'reserve' : 'balanced'),
    boundaryUsage: spatialProfile.nearBoundary ? 'inspection_edge' : 'standard'
  };
}

export function normalizeSpacePolicy(policy = {}, spatialProfile = null) {
  const defaults = buildDefaultSpacePolicy(spatialProfile || {
    accessClass: 'medium',
    sizeBand: { key: 'medium' },
    nearBoundary: false
  });

  const maxGroups = clamp(toNumber(policy.maxGroups, defaults.maxGroups), 1, 12);
  const maxUtilizationPercent = clamp(toNumber(policy.maxUtilizationPercent, defaults.maxUtilizationPercent), 35, 100);
  const allowedGroupProfiles = safeArray(policy.allowedGroupProfiles).length
    ? Array.from(new Set(safeArray(policy.allowedGroupProfiles)))
    : defaults.allowedGroupProfiles;

  return {
    ...defaults,
    ...policy,
    mode: ['shared', 'exclusive', 'percentage', 'priority_queue'].includes(policy.mode)
      ? policy.mode
      : defaults.mode,
    maxGroups,
    maxUtilizationPercent,
    allowedGroupProfiles
  };
}

function calculateAssignedVolume(items = [], assignments = []) {
  return assignments.reduce((total, assignment) => {
    const groupId = typeof assignment === 'object' ? assignment.id : assignment;
    return total + items
      .filter((item) => String(item.group_id) === String(groupId))
      .reduce((groupTotal, item) => groupTotal + (toNumber(item.length) * toNumber(item.width) * toNumber(item.height)), 0);
  }, 0);
}

function getRegionVolumeMm3(region) {
  const spanX = toNumber(region.width);
  const spanZ = toNumber(region.length, toNumber(region.height));
  const spanY = toNumber(region.depth, toNumber(region.height));
  return toNumber(region?.metrics?.volume_mm3, spanX * spanZ * spanY);
}

function getAllowedProfileLabels(policy) {
  const map = {
    fast_pick: '高頻 / 快取型',
    balanced: '平衡型',
    compact: '精簡 / 緊湊型',
    bulk: '大量 / 體積型'
  };

  return policy.allowedGroupProfiles.map((profileKey) => map[profileKey] || profileKey);
}

function evaluateFit(region, groupProfile, policy, currentAssignments, items) {
  const reasons = [];
  const warnings = [];
  const conflicts = [];
  let score = 70;

  const regionVolume = getRegionVolumeMm3(region);
  const assignedVolume = calculateAssignedVolume(items, currentAssignments);
  const nextVolume = assignedVolume + groupProfile.totalVolumeMm3;
  const projectedUtilization = regionVolume > 0 ? (nextVolume / regionVolume) * 100 : 0;

  if (currentAssignments.some((assignment) => String((assignment.id || assignment)) === String(groupProfile.id))) {
    conflicts.push('此群組已分配到其他空間。');
  }

  if (policy.mode === 'exclusive' && currentAssignments.length > 0) {
    conflicts.push('此空間為獨占模式，不能再加入其他群組。');
  }

  if (currentAssignments.length >= policy.maxGroups) {
    conflicts.push(`此空間最多容納 ${policy.maxGroups} 個群組。`);
  }

  if (!policy.allowedGroupProfiles.includes(groupProfile.profileKey)) {
    conflicts.push(`此空間目前只允許 ${getAllowedProfileLabels(policy).join(' / ')}。`);
  }

  if (projectedUtilization > policy.maxUtilizationPercent) {
    conflicts.push(`分配後容量占比會到 ${projectedUtilization.toFixed(1)}%，超過空間上限 ${policy.maxUtilizationPercent}%。`);
  }

  if (groupProfile.profileKey === 'fast_pick') {
    if (region.spatial.nearMainAisle || region.spatial.nearEntrance) {
      score += 18;
      reasons.push('靠主走道或入口，利於高頻揀取。');
    } else {
      score -= 16;
      warnings.push('此群組偏高頻，但目前區塊較深，揀貨路徑會拉長。');
    }
  }

  if (groupProfile.profileKey === 'bulk') {
    if (region.spatial.sizeBand.key === 'large') {
      score += 16;
      reasons.push('區塊尺度較大，較能容納大量群組。');
    } else {
      score -= 18;
      warnings.push('此群組體積偏大，放入較小區塊會壓縮後續配置彈性。');
    }
  }

  if (policy.mode === 'exclusive' && groupProfile.profileKey !== 'bulk') {
    warnings.push('此空間設定為獨占，對較小群組可能過度保留。');
    score -= 8;
  }

  if (policy.mode === 'shared' && groupProfile.profileKey === 'bulk') {
    warnings.push('共享空間放入大量群組時，後續共用彈性會降低。');
    score -= 6;
  }

  if (region.spatial.nearBoundary && groupProfile.profileKey === 'fast_pick') {
    warnings.push('靠邊界區對高頻群組不如主走道旁直覺。');
    score -= 5;
  }

  if (region.spatial.accessClass === 'high' && groupProfile.profileKey !== 'bulk') {
    reasons.push('此區塊可達性高，適合需要快進快出的群組。');
    score += 8;
  }

  if (!reasons.length) {
    reasons.push('容量與位置條件大致可用。');
  }

  if (conflicts.length) {
    score = Math.max(5, score - 55);
  } else if (warnings.length) {
    score = Math.max(25, score - 12);
  }

  const status = conflicts.length ? 'error' : (warnings.length ? 'warning' : 'ok');

  return {
    status,
    score: Math.round(clamp(score, 0, 100)),
    reasons,
    warnings,
    conflicts,
    projectedUtilization
  };
}

function evaluateCurrentPolicyHealth(region, assignments, groupProfilesById, items) {
  const policy = region.spacePolicy;
  const issues = [];
  const warnings = [];

  if (policy.mode === 'exclusive' && assignments.length > 1) {
    issues.push('空間規則為獨占，但目前已有多個群組。');
  }

  if (assignments.length > policy.maxGroups) {
    issues.push(`目前群組數 ${assignments.length} 已超過上限 ${policy.maxGroups}。`);
  }

  const invalidProfiles = assignments
    .map((assignment) => groupProfilesById.get(String(assignment.id || assignment)))
    .filter(Boolean)
    .filter((groupProfile) => !policy.allowedGroupProfiles.includes(groupProfile.profileKey));

  if (invalidProfiles.length) {
    issues.push(`已有群組不符合此空間允許類型：${invalidProfiles.map((group) => group.name).join('、')}。`);
  }

  const regionVolume = getRegionVolumeMm3(region);
  const assignedVolume = calculateAssignedVolume(items, assignments);
  const utilization = regionVolume > 0 ? ((assignedVolume / regionVolume) * 100) : 0;

  if (utilization > policy.maxUtilizationPercent) {
    issues.push(`目前容量占比 ${utilization.toFixed(1)}% 超過上限 ${policy.maxUtilizationPercent}%。`);
  } else if (utilization > (policy.maxUtilizationPercent * 0.9)) {
    warnings.push(`容量占比接近上限，目前為 ${utilization.toFixed(1)}%。`);
  }

  return {
    status: issues.length ? 'error' : (warnings.length ? 'warning' : 'ok'),
    messages: issues.length ? issues : warnings,
    utilization
  };
}

function buildSizeThresholds(regions = []) {
  const areas = regions.map((region) => rectArea(getRect(region))).filter((value) => value > 0);
  return {
    small: quantile(areas, 0.33),
    large: quantile(areas, 0.66)
  };
}

export function buildAllocationWorkspaceState({
  regions = [],
  groups = [],
  items = [],
  assignments = {},
  spacePolicies = {},
  constraintZones = [],
  selectedGroupId = null
}) {
  const groupProfiles = buildGroupProfiles(groups, items);
  const groupProfilesById = new Map(groupProfiles.map((group) => [String(group.id), group]));
  const context = buildConstraintContext(regions, constraintZones);
  const sizeThresholds = buildSizeThresholds(regions);
  const selectedGroup = selectedGroupId != null ? groupProfilesById.get(String(selectedGroupId)) || null : null;

  const regionStates = regions.map((region) => {
    const spatial = buildRegionSpatialProfile(region, context, sizeThresholds);
    const policy = normalizeSpacePolicy(spacePolicies?.[region.id], spatial);
    const regionAssignments = safeArray(assignments?.[region.id]);
    const computedMetrics = {
      ...(region.metrics || {}),
      area_m2: toNumber(region?.metrics?.area_m2, rectArea(spatial.rect) / 1e6),
      volume_mm3: toNumber(region?.metrics?.volume_mm3, getRegionVolumeMm3(region))
    };
    const policyHealth = evaluateCurrentPolicyHealth(
      { ...region, metrics: computedMetrics, spatial, spacePolicy: policy },
      regionAssignments,
      groupProfilesById,
      items
    );
    const fit = selectedGroup
      ? evaluateFit({ ...region, metrics: computedMetrics, spatial, spacePolicy: policy }, selectedGroup, policy, regionAssignments, items)
      : null;

    return {
      ...region,
      metrics: computedMetrics,
      spatial,
      spacePolicy: policy,
      usage: {
        assignedCount: regionAssignments.length,
        assignedVolumeMm3: calculateAssignedVolume(items, regionAssignments),
        projectedUtilization: policyHealth.utilization
      },
      policyHealth,
      fit
    };
  });

  return {
    groups: groupProfiles,
    groupProfilesById,
    regions: regionStates,
    selectedGroup,
    layoutContext: context
  };
}

export function evaluateAssignmentAttempt({
  region,
  groupProfile,
  assignments = {},
  items = []
}) {
  const regionAssignments = safeArray(assignments?.[region.id]);
  return evaluateFit(region, groupProfile, region.spacePolicy, regionAssignments, items);
}

export function getPolicySummary(policy = {}) {
  const modeLabels = {
    shared: '共享模式',
    exclusive: '獨占模式',
    percentage: '比例模式',
    priority_queue: '優先序列'
  };

  return [
    modeLabels[policy.mode] || policy.mode,
    `最多 ${policy.maxGroups} 群組`,
    `容量上限 ${policy.maxUtilizationPercent}%`
  ];
}
