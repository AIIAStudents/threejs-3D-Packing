function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function normalizeText(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1' || value === 1) {
    return true;
  }
  if (value === 'false' || value === '0' || value === 0) {
    return false;
  }
  return fallback;
}

function normalizeObjective(objective = {}) {
  const storageDensity = toNumber(objective.storage_density, 0.4);
  const pickingEfficiency = toNumber(objective.picking_efficiency, 0.4);
  const safetyMargin = toNumber(objective.safety_margin, 0.2);
  const total = Math.max(storageDensity + pickingEfficiency + safetyMargin, 0.01);

  return {
    storage_density: Math.round((storageDensity / total) * 100) / 100,
    picking_efficiency: Math.round((pickingEfficiency / total) * 100) / 100,
    safety_margin: Math.round((safetyMargin / total) * 100) / 100
  };
}

function normalizeEntrances(entrances = []) {
  if (!Array.isArray(entrances)) {
    return [];
  }

  return entrances
    .map((entrance, index) => ({
      id: normalizeText(entrance.id, `entrance_${index + 1}`),
      side: ['north', 'south', 'east', 'west'].includes(entrance.side) ? entrance.side : 'south',
      width_mm: toNumber(entrance.width_mm, null),
      position_mm: toNumber(entrance.position_mm, null),
      role: normalizeText(entrance.role, 'entry')
    }))
    .filter((entrance) => entrance.width_mm !== null || entrance.position_mm !== null || entrance.role);
}

function normalizeSafetyZones(zones = []) {
  if (!Array.isArray(zones)) {
    return [];
  }

  return zones.map((zone, index) => ({
    id: normalizeText(zone.id, `safety_${index + 1}`),
    type: ['fire_lane', 'escape_route', 'equipment_clearance'].includes(zone.type)
      ? zone.type
      : 'equipment_clearance',
    polygon: Array.isArray(zone.polygon) ? zone.polygon : []
  }));
}

function normalizeSpecialZones(zones = []) {
  if (!Array.isArray(zones)) {
    return [];
  }

  return zones.filter((zone) => ['cold_storage', 'hazardous', 'heavy_goods'].includes(zone));
}

function normalizeSemanticDirectives(value = {}) {
  const directives = value && typeof value === 'object' ? value : {};
  return {
    main_aisle_mode: ['narrow', 'wide'].includes(directives.main_aisle_mode)
      ? directives.main_aisle_mode
      : null,
    fast_moving_zone: normalizeBoolean(directives.fast_moving_zone, false),
    shipping_buffer_side: ['north', 'south', 'east', 'west', 'entry'].includes(directives.shipping_buffer_side)
      ? directives.shipping_buffer_side
      : null,
    enlarge_storage_zone_index: toNumber(directives.enlarge_storage_zone_index, null),
    debug_matches: Array.isArray(directives.debug_matches) ? directives.debug_matches : []
  };
}

export const QUICK_MODE_STEPS = [
  { id: 'space-basics', title: '空間基本資料', description: '倉庫尺寸、形狀、出入口' },
  { id: 'operations', title: '使用方式', description: '搬運方式、揀貨與作業型態' },
  { id: 'storage', title: '貨物與設備', description: '貨物型態、貨架與特殊區' },
  { id: 'constraints', title: '固定限制', description: '柱位、消防、不可用區' },
  { id: 'preferences', title: '規劃偏好', description: '儲位密度、效率與擴充性' },
  { id: 'result', title: '自動生成結果', description: '2D 配置、AI 摘要與分數' }
];

export function createEmptyPlanningIntent() {
  return {
    warehouse: {
      id: 'warehouse-plan-draft',
      shape: 'rectangle',
      shape_params: {
        l_notch_width_mm: null,
        l_notch_depth_mm: null,
        l_open_corner: 'north_east',
        t_stem_width_mm: null,
        t_head_depth_mm: null,
        t_opening_direction: 'north',
        u_opening_width_mm: null,
        u_opening_depth_mm: null,
        u_opening_direction: 'north'
      },
      dimensions: {
        length_mm: null,
        width_mm: null,
        height_mm: null
      },
      entrances: [],
      safety_zones: []
    },
    operation_profile: {
      handling_mode: 'manual',
      picking_mode: 'manual',
      shipping_frequency: 'medium',
      zoning_required: true,
      loading_area_required: false,
      turning_space_required: false
    },
    storage_profile: {
      goods_type: 'carton',
      rack_mode: 'shelf',
      stackable: true,
      fragile: false,
      sku_density: 'medium',
      special_zones: []
    },
    planning_preferences: {
      objective: normalizeObjective({}),
      keep_fast_moving_near_entry: true,
      reserve_expansion_area: false,
      preferred_layout_style: 'balanced',
      zoning_strategy: 'auto',
      semantic_directives: normalizeSemanticDirectives(),
      quick_targets: {
        storage_zone_count: null,
        aisle_count: null
      }
    },
    natural_language_prompt: '',
    generated_layout: null
  };
}

export function normalizePlanningIntent(rawIntent = {}) {
  const base = createEmptyPlanningIntent();
  const warehouse = rawIntent.warehouse || {};
  const operationProfile = rawIntent.operation_profile || {};
  const storageProfile = rawIntent.storage_profile || {};
  const planningPreferences = rawIntent.planning_preferences || {};

  return {
    warehouse: {
      id: normalizeText(warehouse.id, base.warehouse.id),
      shape: ['rectangle', 'l_shape', 't_shape', 'u_shape', 'custom'].includes(warehouse.shape)
        ? warehouse.shape
        : base.warehouse.shape,
      shape_params: {
        l_notch_width_mm: toNumber(warehouse.shape_params?.l_notch_width_mm, base.warehouse.shape_params.l_notch_width_mm),
        l_notch_depth_mm: toNumber(warehouse.shape_params?.l_notch_depth_mm, base.warehouse.shape_params.l_notch_depth_mm),
        l_open_corner: ['north_east', 'north_west', 'south_east', 'south_west'].includes(warehouse.shape_params?.l_open_corner)
          ? warehouse.shape_params.l_open_corner
          : base.warehouse.shape_params.l_open_corner,
        t_stem_width_mm: toNumber(warehouse.shape_params?.t_stem_width_mm, base.warehouse.shape_params.t_stem_width_mm),
        t_head_depth_mm: toNumber(warehouse.shape_params?.t_head_depth_mm, base.warehouse.shape_params.t_head_depth_mm),
        t_opening_direction: ['north', 'south', 'east', 'west'].includes(warehouse.shape_params?.t_opening_direction)
          ? warehouse.shape_params.t_opening_direction
          : base.warehouse.shape_params.t_opening_direction,
        u_opening_width_mm: toNumber(warehouse.shape_params?.u_opening_width_mm, base.warehouse.shape_params.u_opening_width_mm),
        u_opening_depth_mm: toNumber(warehouse.shape_params?.u_opening_depth_mm, base.warehouse.shape_params.u_opening_depth_mm),
        u_opening_direction: ['north', 'south', 'east', 'west'].includes(warehouse.shape_params?.u_opening_direction)
          ? warehouse.shape_params.u_opening_direction
          : base.warehouse.shape_params.u_opening_direction
      },
      dimensions: {
        length_mm: toNumber(warehouse.dimensions?.length_mm, base.warehouse.dimensions.length_mm),
        width_mm: toNumber(warehouse.dimensions?.width_mm, base.warehouse.dimensions.width_mm),
        height_mm: toNumber(warehouse.dimensions?.height_mm, base.warehouse.dimensions.height_mm)
      },
      entrances: normalizeEntrances(warehouse.entrances || base.warehouse.entrances),
      safety_zones: normalizeSafetyZones(warehouse.safety_zones || base.warehouse.safety_zones)
    },
    operation_profile: {
      handling_mode: ['manual', 'pallet_jack', 'forklift', 'mixed'].includes(operationProfile.handling_mode)
        ? operationProfile.handling_mode
        : base.operation_profile.handling_mode,
      picking_mode: ['batch', 'wave', 'manual', 'none'].includes(operationProfile.picking_mode)
        ? operationProfile.picking_mode
        : base.operation_profile.picking_mode,
      shipping_frequency: ['low', 'medium', 'high'].includes(operationProfile.shipping_frequency)
        ? operationProfile.shipping_frequency
        : base.operation_profile.shipping_frequency,
      zoning_required: normalizeBoolean(operationProfile.zoning_required, base.operation_profile.zoning_required),
      loading_area_required: normalizeBoolean(operationProfile.loading_area_required, base.operation_profile.loading_area_required),
      turning_space_required: normalizeBoolean(operationProfile.turning_space_required, base.operation_profile.turning_space_required)
    },
    storage_profile: {
      goods_type: ['carton', 'pallet', 'mixed'].includes(storageProfile.goods_type)
        ? storageProfile.goods_type
        : base.storage_profile.goods_type,
      rack_mode: ['none', 'shelf', 'pallet_rack', 'mixed'].includes(storageProfile.rack_mode)
        ? storageProfile.rack_mode
        : base.storage_profile.rack_mode,
      stackable: normalizeBoolean(storageProfile.stackable, base.storage_profile.stackable),
      fragile: normalizeBoolean(storageProfile.fragile, base.storage_profile.fragile),
      sku_density: ['low', 'medium', 'high'].includes(storageProfile.sku_density)
        ? storageProfile.sku_density
        : base.storage_profile.sku_density,
      special_zones: normalizeSpecialZones(storageProfile.special_zones || base.storage_profile.special_zones)
    },
    planning_preferences: {
      objective: normalizeObjective(planningPreferences.objective || base.planning_preferences.objective),
      keep_fast_moving_near_entry: normalizeBoolean(
        planningPreferences.keep_fast_moving_near_entry,
        base.planning_preferences.keep_fast_moving_near_entry
      ),
      reserve_expansion_area: normalizeBoolean(
        planningPreferences.reserve_expansion_area,
        base.planning_preferences.reserve_expansion_area
      ),
      preferred_layout_style: ['balanced', 'high_density', 'high_efficiency', 'conservative'].includes(planningPreferences.preferred_layout_style)
        ? planningPreferences.preferred_layout_style
        : base.planning_preferences.preferred_layout_style,
      zoning_strategy: ['auto', 'temperature', 'fast_moving', 'safety'].includes(planningPreferences.zoning_strategy)
        ? planningPreferences.zoning_strategy
        : base.planning_preferences.zoning_strategy,
      semantic_directives: normalizeSemanticDirectives(
        planningPreferences.semantic_directives || base.planning_preferences.semantic_directives
      ),
      quick_targets: {
        storage_zone_count: toNumber(
          planningPreferences.quick_targets?.storage_zone_count,
          base.planning_preferences.quick_targets.storage_zone_count
        ),
        aisle_count: toNumber(
          planningPreferences.quick_targets?.aisle_count,
          base.planning_preferences.quick_targets.aisle_count
        )
      }
    },
    natural_language_prompt: normalizeText(rawIntent.natural_language_prompt, base.natural_language_prompt),
    generated_layout: rawIntent.generated_layout || null
  };
}

export function buildMissingFields(intent) {
  const missingFields = [];
  const dimensions = intent?.warehouse?.dimensions || {};

  if (!dimensions.length_mm) {
    missingFields.push({ path: 'warehouse.dimensions.length_mm', reason: '尚未提供倉庫長度' });
  }
  if (!dimensions.width_mm) {
    missingFields.push({ path: 'warehouse.dimensions.width_mm', reason: '尚未提供倉庫寬度' });
  }
  if (!dimensions.height_mm) {
    missingFields.push({ path: 'warehouse.dimensions.height_mm', reason: '尚未提供倉庫高度' });
  }
  if (!intent?.warehouse?.entrances?.length) {
    missingFields.push({ path: 'warehouse.entrances', reason: '尚未提供入口或出貨口位置' });
  }

  return missingFields;
}
