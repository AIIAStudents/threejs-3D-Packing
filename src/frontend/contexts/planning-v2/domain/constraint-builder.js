import { normalizePlanningIntent } from './planning-intent.js';

const DEFAULT_DIMENSIONS = {
  length_mm: 24000,
  width_mm: 12000,
  height_mm: 6000
};

function pushDefault(assumptions, path, value, reason) {
  assumptions.push({
    path,
    rule: 'use_default',
    value,
    reason
  });
}

function resolveDimension(value, path, assumptions) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) {
    return Number(value);
  }

  const fallback = DEFAULT_DIMENSIONS[path];
  pushDefault(assumptions, `warehouse.dimensions.${path}`, fallback, 'V2 MVP 需要有效尺寸才能建立可用配置。');
  return fallback;
}

function resolvePlannerShape(shape, assumptions) {
  if (shape === 'rectangle') return 'rect';
  if (shape === 'l_shape' || shape === 't_shape' || shape === 'u_shape') return shape;

  pushDefault(assumptions, 'warehouse.shape', 'rectangle', 'Quick mode 目前以規則形狀為主。');
  return 'rect';
}

function buildEntranceConfig(intent, assumptions, lengthMm) {
  const entrance = intent.warehouse.entrances[0];
  if (entrance) {
    return {
      id: entrance.id,
      side: entrance.side || 'south',
      width_mm: Number(entrance.width_mm) || 2400,
      position_mm: Number(entrance.position_mm) || Math.round(lengthMm / 2)
    };
  }

  pushDefault(assumptions, 'warehouse.entrances', [{ side: 'south', width_mm: 2400 }], '未提供入口時，預設以南側中央入口估算。');
  return {
    id: 'entry_default',
    side: 'south',
    width_mm: 2400,
    position_mm: Math.round(lengthMm / 2)
  };
}

function derivePlanningPreset(intent) {
  const objective = intent.planning_preferences.objective;
  if (objective.storage_density >= objective.picking_efficiency + 0.1) return 'storage_first';
  if (objective.picking_efficiency >= objective.storage_density + 0.1) return 'picking_first';
  return 'balanced';
}

function deriveAisleProfile(intent) {
  const handlingMode = intent.operation_profile.handling_mode;
  const turningSpaceRequired = intent.operation_profile.turning_space_required;
  const profile = {
    primaryAisleWidth: 2200,
    secondaryAisleWidth: 1400
  };

  if (handlingMode === 'forklift') {
    profile.primaryAisleWidth = 3200;
    profile.secondaryAisleWidth = 1800;
  } else if (handlingMode === 'mixed') {
    profile.primaryAisleWidth = 2800;
    profile.secondaryAisleWidth = 1600;
  } else if (handlingMode === 'pallet_jack') {
    profile.primaryAisleWidth = 2600;
    profile.secondaryAisleWidth = 1500;
  }

  if (turningSpaceRequired) {
    profile.primaryAisleWidth += 300;
    profile.secondaryAisleWidth += 200;
  }

  return profile;
}

function deriveTargetStorageBand(intent) {
  const quickTargets = intent.planning_preferences?.quick_targets || {};
  const desiredZoneCount = Number(quickTargets.storage_zone_count) || 0;

  if (desiredZoneCount > 0) {
    const lengthMm = Number(intent.warehouse?.dimensions?.length_mm) || DEFAULT_DIMENSIONS.length_mm;
    return Math.max(1800, Math.min(4800, Math.round(lengthMm / desiredZoneCount)));
  }

  if (intent.storage_profile.goods_type === 'pallet') return 3600;
  if (intent.storage_profile.goods_type === 'mixed') return 3000;
  return 2400;
}

export function buildPlanningConstraints(rawIntent = {}) {
  const assumptions = [];
  const intent = normalizePlanningIntent(rawIntent);
  const lengthMm = resolveDimension(intent.warehouse.dimensions.length_mm, 'length_mm', assumptions);
  const widthMm = resolveDimension(intent.warehouse.dimensions.width_mm, 'width_mm', assumptions);
  const heightMm = resolveDimension(intent.warehouse.dimensions.height_mm, 'height_mm', assumptions);
  const aisleProfile = deriveAisleProfile(intent);
  const plannerShape = resolvePlannerShape(intent.warehouse.shape, assumptions);
  const entry = buildEntranceConfig(intent, assumptions, lengthMm);
  const safetyBuffer = intent.warehouse.safety_zones.length > 0 ? 450 : 300;
  const shapeParams = intent.warehouse.shape_params || {};
  const quickTargets = intent.planning_preferences?.quick_targets || {};
  const desiredAisleCount = Number(quickTargets.aisle_count) || 0;

  if (desiredAisleCount > 0) {
    const densityFactor = Math.max(0.78, Math.min(1.2, 6 / Math.max(1, desiredAisleCount)));
    aisleProfile.secondaryAisleWidth = Math.max(1200, Math.round(aisleProfile.secondaryAisleWidth * densityFactor));
  }

  const containerConfig = {
    shape: plannerShape,
    widthX: lengthMm,
    depthZ: widthMm,
    heightY: heightMm,
    l_notch_width: Number(shapeParams.l_notch_width_mm) || Math.round(lengthMm * 0.38),
    l_notch_depth: Number(shapeParams.l_notch_depth_mm) || Math.round(widthMm * 0.38),
    l_open_corner: shapeParams.l_open_corner || 'north_east',
    t_stem_width: Number(shapeParams.t_stem_width_mm) || Math.round(lengthMm * 0.42),
    t_head_depth: Number(shapeParams.t_head_depth_mm) || Math.round(widthMm * 0.36),
    t_opening_direction: shapeParams.t_opening_direction || 'north',
    u_opening_width: Number(shapeParams.u_opening_width_mm) || Math.round(lengthMm * 0.36),
    u_opening_depth: Number(shapeParams.u_opening_depth_mm) || Math.round(widthMm * 0.42),
    u_opening_direction: shapeParams.u_opening_direction || 'north',
    planning: {
      primaryAisleWidth: aisleProfile.primaryAisleWidth,
      secondaryAisleWidth: aisleProfile.secondaryAisleWidth,
      safetyBuffer,
      preserveCentralMainAisle: true,
      preserveBoundaryInspectionAisle: intent.warehouse.safety_zones.length > 0,
      mainAisleAxis: ['east', 'west'].includes(entry.side) ? 'horizontal' : 'vertical',
      mainAisleOffsetRatio: 0.5,
      targetStorageBand: deriveTargetStorageBand(intent),
      strategy: derivePlanningPreset(intent),
      optimizationWeights: {
        storageUtilization: intent.planning_preferences.objective.storage_density,
        aisleBalance: 0.14,
        accessibility: Math.max(0.14, intent.planning_preferences.objective.safety_margin),
        pickingEfficiency: intent.planning_preferences.objective.picking_efficiency,
        slottingFlexibility: intent.operation_profile.zoning_required ? 0.14 : 0.08
      }
    }
  };

  const plannerConstraints = {
    building: {
      columns: {
        mode: 'none',
        columnWidth: 0,
        columnDepth: 0,
        spacingX: 0,
        spacingZ: 0,
        wallOffset: 0,
        customColumns: []
      },
      wallClearance: safetyBuffer
    },
    circulation: {
      mainAisle: {
        enabled: true,
        width: aisleProfile.primaryAisleWidth,
        direction: ['east', 'west'].includes(entry.side) ? 'along_length' : 'along_width',
        position: 'center'
      },
      forkliftAisles: {
        enabled: intent.operation_profile.handling_mode === 'forklift' || intent.operation_profile.handling_mode === 'mixed',
        count: 2,
        width: aisleProfile.secondaryAisleWidth,
        spacing: 'auto'
      }
    },
    planning: containerConfig.planning
  };

  return {
    planning_intent: intent,
    assumptions,
    container_config: containerConfig,
    planner_constraints: plannerConstraints
  };
}
