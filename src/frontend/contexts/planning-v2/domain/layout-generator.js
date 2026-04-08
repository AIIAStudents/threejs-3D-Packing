import { buildWarehouseLayoutPlan } from '../../space-design/domain/warehouse-layout-planner.js';
import { buildPlanningConstraints } from './constraint-builder.js';
import { buildPlanningExplanation } from './explanation-engine.js';
import { buildPlanningScorecard } from './scoring-engine.js';

const PRESETS = {
  balanced: { id: 'balanced', label: '保守方案', recipe: 'conservative', planningPatch: { strategy: 'balanced', preserveBoundaryInspectionAisle: true } },
  high_efficiency: { id: 'high_efficiency', label: '高效率方案', recipe: 'efficiency', planningPatch: { strategy: 'picking_first', preserveBoundaryInspectionAisle: true } },
  high_density: { id: 'high_density', label: '高密度方案', recipe: 'density', planningPatch: { strategy: 'storage_first', preserveBoundaryInspectionAisle: false } }
};

const ENTRY_LABELS = { north: '北側', south: '南側', east: '東側', west: '西側' };
const HANDLING_LABELS = { manual: '人工', pallet_jack: '拖板車', forklift: '叉車', mixed: '混合' };
const GOODS_LABELS = { carton: '紙箱 / 箱件', pallet: '棧板', mixed: '混合' };
const RACK_LABELS = { shelf: '層架', pallet_rack: '棧板貨架', mixed: '混合', none: '暫不設架' };
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  Object.keys(source).forEach((key) => {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  });
  return target;
}

function mergePlanning(baseConfig, planningPatch = {}) {
  return { ...baseConfig, planning: { ...(baseConfig.planning || {}), ...planningPatch } };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getRect(zone) {
  const rect = zone?.geometry_2d?.rect;
  return rect ? { x: rect.x_min_mm || 0, z: rect.z_min_mm || 0, width: Math.max(0, (rect.x_max_mm || 0) - (rect.x_min_mm || 0)), depth: Math.max(0, (rect.z_max_mm || 0) - (rect.z_min_mm || 0)) } : null;
}

function rectArea(zone) {
  const rect = getRect(zone);
  return rect ? rect.width * rect.depth : 0;
}

function createRectZone({ id, type, zoneCategory, subtype, rect, depth, label, metadata = {}, tags = [] }) {
  return {
    id,
    type,
    zoneCategory,
    subtype,
    label,
    name: label,
    x: rect.x + (rect.width / 2),
    y: rect.z + (rect.depth / 2),
    width: rect.width,
    height: rect.depth,
    depth: depth || 2400,
    area: Math.round((rect.width * rect.depth) / 10000) / 100,
    geometry_2d: { kind: 'rect', rect: { x_min_mm: rect.x, x_max_mm: rect.x + rect.width, z_min_mm: rect.z, z_max_mm: rect.z + rect.depth } },
    height_policy: { mode: 'inherit_container', y_mm: depth || 2400 },
    metrics: { area_m2: Math.round((rect.width * rect.depth) / 10000) / 100, volume_mm3: rect.width * rect.depth * (depth || 2400), max_span_x_mm: rect.width, max_span_z_mm: rect.depth },
    tags,
    metadata
  };
}

function cloneZone(zone, rect, overrides = {}) {
  return createRectZone({
    id: overrides.id || zone.id,
    type: overrides.type || zone.type,
    zoneCategory: overrides.zoneCategory || zone.zoneCategory,
    subtype: overrides.subtype || zone.subtype,
    rect,
    depth: overrides.depth || zone.depth,
    label: overrides.label || zone.label || zone.name || zone.id,
    metadata: { ...(zone.metadata || {}), ...(overrides.metadata || {}) },
    tags: [...new Set([...(zone.tags || []), ...(overrides.tags || [])])]
  });
}

function updateZoneRect(zone, rect) {
  const next = createRectZone({
    id: zone.id,
    type: zone.type,
    zoneCategory: zone.zoneCategory,
    subtype: zone.subtype,
    rect,
    depth: zone.depth,
    label: zone.label || zone.name || zone.id,
    metadata: zone.metadata || {},
    tags: zone.tags || []
  });
  Object.assign(zone, next);
}

function isPrimaryStorage(zone) {
  const rect = getRect(zone);
  return !!rect && zone?.type === 'usable' && rect.width >= 1600 && rect.depth >= 1600 && (rect.width * rect.depth) >= 3_600_000;
}

function pad(index) {
  return String(index).padStart(2, '0');
}

function relabelZones(layoutPlan) {
  let storage = 0; let main = 0; let sub = 0; let safety = 0;
  (layoutPlan?.zones || []).forEach((zone) => {
    if (!zone || zone.metadata?.preserveLabel) return;
    if (zone.type === 'usable' && isPrimaryStorage(zone)) zone.label = zone.name = `儲位區 ${pad(++storage)}`;
    else if (zone.type === 'usable') zone.label = zone.name = '作業區';
    else if (zone.zoneCategory === 'accessible_path' && zone.subtype === 'main_aisle') zone.label = zone.name = `主走道 ${++main}`;
    else if (zone.zoneCategory === 'accessible_path') zone.label = zone.name = `次走道 ${++sub}`;
    else if (zone.zoneCategory === 'safety_buffer') zone.label = zone.name = `緩衝區 ${++safety}`;
  });
  return layoutPlan;
}

function resolveSide(side, planningIntent) {
  return side && side !== 'entry' ? side : (planningIntent?.warehouse?.entrances?.[0]?.side || 'south');
}

function buildSideRect(side, config, patch = {}) {
  const widthRatio = clamp(Number(patch.width_ratio) || 0.18, 0.08, 0.42);
  const depthRatio = clamp(Number(patch.depth_ratio) || 0.18, 0.08, 0.42);
  const stripWidth = Math.round(config.widthX * widthRatio);
  const stripDepth = Math.round(config.depthZ * depthRatio);
  if (side === 'east') return { x: config.widthX - stripWidth, z: 0, width: stripWidth, depth: config.depthZ };
  if (side === 'west') return { x: 0, z: 0, width: stripWidth, depth: config.depthZ };
  if (side === 'north') return { x: 0, z: 0, width: config.widthX, depth: stripDepth };
  return { x: 0, z: config.depthZ - stripDepth, width: config.widthX, depth: stripDepth };
}

function rectDistanceToSide(zone, side, config) {
  const rect = zone?.geometry_2d?.rect;
  if (!rect) return Number.POSITIVE_INFINITY;
  if (side === 'east') return Math.abs(config.widthX - rect.x_max_mm);
  if (side === 'west') return Math.abs(rect.x_min_mm);
  if (side === 'north') return Math.abs(rect.z_min_mm);
  return Math.abs(config.depthZ - rect.z_max_mm);
}

function replaceZone(layoutPlan, sourceZoneId, replacements) {
  const zones = layoutPlan?.zones || [];
  const index = zones.findIndex((zone) => zone.id === sourceZoneId);
  if (index >= 0) zones.splice(index, 1, ...replacements);
}

function findLargestSplittableZone(layoutPlan, orientation, gap = 0) {
  return (layoutPlan?.zones || [])
    .filter((zone) => zone?.type === 'usable')
    .map((zone) => ({ zone, rect: getRect(zone) }))
    .filter(({ rect }) => rect && ((orientation === 'horizontal' ? rect.depth : rect.width) >= (1600 * 2) + gap))
    .sort((a, b) => rectArea(b.zone) - rectArea(a.zone))[0] || null;
}

function splitZone(layoutPlan, zone, orientation, indexSeed) {
  const rect = getRect(zone);
  if (!rect) return false;
  const alongDepth = orientation === 'horizontal';
  const span = alongDepth ? rect.depth : rect.width;
  const a = Math.floor(span / 2);
  const b = span - a;
  if (a < 1600 || b < 1600) return false;
  const first = alongDepth ? { x: rect.x, z: rect.z, width: rect.width, depth: a } : { x: rect.x, z: rect.z, width: a, depth: rect.depth };
  const second = alongDepth ? { x: rect.x, z: rect.z + a, width: rect.width, depth: b } : { x: rect.x + a, z: rect.z, width: b, depth: rect.depth };
  replaceZone(layoutPlan, zone.id, [cloneZone(zone, first, { id: `${zone.id}_split_${indexSeed}_a` }), cloneZone(zone, second, { id: `${zone.id}_split_${indexSeed}_b` })]);
  return true;
}

function carveAisle(layoutPlan, containerConfig, aisleIndex, recipe) {
  const mainAxis = recipe.mainAisleAxis || containerConfig?.planning?.mainAisleAxis || 'vertical';
  const orientation = mainAxis === 'vertical' ? 'horizontal' : 'vertical';
  const aisleWidth = Number(recipe.secondaryAisleWidth || containerConfig?.planning?.secondaryAisleWidth) || 1200;
  const target = findLargestSplittableZone(layoutPlan, orientation, aisleWidth);
  if (!target) return false;
  const rect = target.rect;
  const alongDepth = orientation === 'horizontal';
  const span = alongDepth ? rect.depth : rect.width;
  const shoulder = Math.floor((span - aisleWidth) / 2);
  const remain = span - aisleWidth - shoulder;
  if (shoulder < 1500 || remain < 1500) return false;
  const a = alongDepth ? { x: rect.x, z: rect.z, width: rect.width, depth: shoulder } : { x: rect.x, z: rect.z, width: shoulder, depth: rect.depth };
  const aisle = alongDepth ? { x: rect.x, z: rect.z + shoulder, width: rect.width, depth: aisleWidth } : { x: rect.x + shoulder, z: rect.z, width: aisleWidth, depth: rect.depth };
  const b = alongDepth ? { x: rect.x, z: rect.z + shoulder + aisleWidth, width: rect.width, depth: remain } : { x: rect.x + shoulder + aisleWidth, z: rect.z, width: remain, depth: rect.depth };
  replaceZone(layoutPlan, target.zone.id, [
    cloneZone(target.zone, a, { id: `${target.zone.id}_aisle_${aisleIndex}_a` }),
    createRectZone({ id: `secondary_aisle_${aisleIndex}`, type: 'unusable_aisle', zoneCategory: 'accessible_path', subtype: 'secondary_aisle', rect: aisle, depth: containerConfig.heightY, label: `次走道 ${aisleIndex}`, metadata: { preserveLabel: true, recipe: recipe.id } }),
    cloneZone(target.zone, b, { id: `${target.zone.id}_aisle_${aisleIndex}_b` })
  ]);
  return true;
}

function deriveIntentZonePatches(planningIntent) {
  const patches = [];
  const entrySide = planningIntent?.warehouse?.entrances?.[0]?.side || 'south';
  if (planningIntent?.operation_profile?.loading_area_required) {
    patches.push({
      kind: 'shipping_buffer',
      side: entrySide,
      label: '出貨緩衝區',
      depth_ratio: planningIntent?.operation_profile?.shipping_frequency === 'high' ? 0.18 : 0.14
    });
  }
  if (planningIntent?.planning_preferences?.keep_fast_moving_near_entry) patches.push({ kind: 'fast_moving_zone', side: entrySide, label: '高頻儲位區' });
  const enlarged = planningIntent?.planning_preferences?.semantic_directives?.enlarge_storage_zone_index;
  if (Number.isFinite(Number(enlarged)) && Number(enlarged) > 0) patches.push({ kind: 'enlarge_storage_zone', zone_index: Number(enlarged), scale: 1.12 });
  return patches;
}

function tuneZonePatchesForRecipe(zonePatches, recipe, containerConfig) {
  return zonePatches.map((patch) => {
    if (patch?.kind !== 'shipping_buffer') {
      return patch;
    }

    const nextPatch = { ...patch };
    const isHorizontal = ['north', 'south', 'entry'].includes(nextPatch.side || recipe.prioritizeEntrySide);
    const span = isHorizontal ? containerConfig.depthZ : containerConfig.widthX;
    const maxRatio = recipe.shippingBufferMaxRatio || 0.18;
    const maxDepthMm = Math.max(700, Number(recipe.shippingBufferCapMm) || 1200);
    const rawDepth = Math.round(span * (Number(nextPatch.depth_ratio) || recipe.shippingBufferRatio || 0.14));
    const tunedDepth = Math.min(maxDepthMm, Math.max(720, rawDepth));
    nextPatch.depth_ratio = Math.min(maxRatio, tunedDepth / Math.max(span, 1));
    nextPatch.width_ratio = Number(nextPatch.width_ratio) || 1;
    nextPatch.max_depth_mm = tunedDepth;
    return nextPatch;
  });
}

function intersectsRect(a, b) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.z + a.depth <= b.z || b.z + b.depth <= a.z);
}

function carveZoneAgainstReservedRect(zone, reservedRect, suffix = 'reserved') {
  const rect = getRect(zone);
  if (!rect || !intersectsRect(rect, reservedRect)) {
    return [zone];
  }

  const pieces = [];
  const topDepth = Math.max(0, reservedRect.z - rect.z);
  const bottomDepth = Math.max(0, (rect.z + rect.depth) - (reservedRect.z + reservedRect.depth));
  const leftWidth = Math.max(0, reservedRect.x - rect.x);
  const rightWidth = Math.max(0, (rect.x + rect.width) - (reservedRect.x + reservedRect.width));

  if (topDepth >= 240) {
    pieces.push(cloneZone(zone, { x: rect.x, z: rect.z, width: rect.width, depth: topDepth }, { id: `${zone.id}_${suffix}_top` }));
  }
  if (bottomDepth >= 240) {
    pieces.push(cloneZone(zone, { x: rect.x, z: reservedRect.z + reservedRect.depth, width: rect.width, depth: bottomDepth }, { id: `${zone.id}_${suffix}_bottom` }));
  }

  const middleZ = Math.max(rect.z, reservedRect.z);
  const middleDepth = Math.min(rect.z + rect.depth, reservedRect.z + reservedRect.depth) - middleZ;
  if (middleDepth >= 240 && leftWidth >= 240) {
    pieces.push(cloneZone(zone, { x: rect.x, z: middleZ, width: leftWidth, depth: middleDepth }, { id: `${zone.id}_${suffix}_left` }));
  }
  if (middleDepth >= 240 && rightWidth >= 240) {
    pieces.push(cloneZone(zone, { x: reservedRect.x + reservedRect.width, z: middleZ, width: rightWidth, depth: middleDepth }, { id: `${zone.id}_${suffix}_right` }));
  }

  return pieces.filter((piece) => {
    const next = getRect(piece);
    return next && next.width >= 240 && next.depth >= 240;
  });
}

function reservePhysicalZone(layoutPlan, reservedZone, filterFn = () => true) {
  const zones = layoutPlan?.zones || [];
  const reservedRect = getRect(reservedZone);
  if (!reservedRect) return;
  const nextZones = [];
  zones.forEach((zone) => {
    if (zone.id === reservedZone.id) {
      nextZones.push(zone);
      return;
    }
    if (!filterFn(zone)) {
      nextZones.push(zone);
      return;
    }
    nextZones.push(...carveZoneAgainstReservedRect(zone, reservedRect, reservedZone.id));
  });
  layoutPlan.zones = nextZones;
}

function applyZonePatches(layoutPlan, planningIntent, zonePatches = []) {
  const zones = layoutPlan?.zones || [];
  const config = layoutPlan?.containerConfig || {};
  const storageZones = zones.filter((zone) => zone?.type === 'usable').sort((a, b) => rectArea(b) - rectArea(a));
  zonePatches.forEach((patch, index) => {
    if (!patch?.kind) return;
    if (patch.kind === 'shipping_buffer') {
      const shippingZone = createRectZone({
        id: `shipping_buffer_${index + 1}`,
        type: 'unusable_clearance',
        zoneCategory: 'safety_buffer',
        subtype: 'shipping_buffer',
        rect: buildSideRect(resolveSide(patch.side, planningIntent), config, patch),
        depth: config.heightY,
        label: patch.label || '出貨緩衝區',
        tags: ['buffer', 'shipping'],
        metadata: { preserveLabel: true, semanticPatch: patch.kind, physicalReserved: true }
      });
      zones.push(shippingZone);
      reservePhysicalZone(
        layoutPlan,
        shippingZone,
        (zone) => zone?.id !== shippingZone.id && (zone?.type === 'usable' || zone?.zoneCategory === 'accessible_path')
      );
      return;
    }
    if (patch.kind === 'fast_moving_zone') {
      const side = resolveSide(patch.side, planningIntent);
      const target = storageZones.slice().sort((a, b) => rectDistanceToSide(a, side, config) - rectDistanceToSide(b, side, config))[0];
      if (target) {
        target.metadata = {
          ...(target.metadata || {}),
          preferredNearEntry: true,
          semanticMarker: 'fast_moving_zone',
          semanticMarkerLabel: patch.label || '高頻儲位區'
        };
      }
      return;
    }
    if (patch.kind === 'enlarge_storage_zone') {
      const target = storageZones[Math.max(0, (Number(patch.zone_index) || 1) - 1)];
      const rect = getRect(target);
      if (!target || !rect) return;
      const scale = clamp(Number(patch.scale) || 1.12, 1.05, 1.28);
      const next = { x: clamp(Math.round(target.x - (rect.width * scale / 2)), 0, Math.max(0, config.widthX - Math.round(rect.width * scale))), z: clamp(Math.round(target.y - (rect.depth * scale / 2)), 0, Math.max(0, config.depthZ - Math.round(rect.depth * scale))), width: Math.min(config.widthX, Math.round(rect.width * scale)), depth: Math.min(config.depthZ, Math.round(rect.depth * scale)) };
      updateZoneRect(target, next);
      target.label = `儲位區 ${pad(Number(patch.zone_index) || 1)}（加大）`;
      target.name = target.label;
      target.metadata = { ...(target.metadata || {}), preserveLabel: true, enlarged: true };
    }
  });
  return layoutPlan;
}

function createRecipeForPreset(preset, planningIntent, containerConfig) {
  const handling = planningIntent?.operation_profile?.handling_mode || 'manual';
  const basePrimary = handling === 'forklift' ? 3200 : 1800;
  const baseSecondary = handling === 'forklift' ? 1800 : 1200;
  const recipe = {
    id: preset.id,
    key: preset.recipe,
    mainAisleAxis: 'vertical',
    primaryAisleWidth: basePrimary,
    secondaryAisleWidth: baseSecondary,
    desiredStorageCount: Number(planningIntent?.planning_preferences?.quick_targets?.storage_zone_count) || 0,
    desiredAisleCount: Number(planningIntent?.planning_preferences?.quick_targets?.aisle_count) || 0,
    shippingBufferRatio: planningIntent?.operation_profile?.loading_area_required ? 0.14 : 0.08,
    shippingBufferMaxRatio: 0.18,
    shippingBufferCapMm: 1100,
    boundaryBuffer: 80,
    prioritizeEntrySide: planningIntent?.warehouse?.entrances?.[0]?.side || 'south'
  };
  if (preset.recipe === 'conservative') Object.assign(recipe, { primaryAisleWidth: basePrimary + 420, secondaryAisleWidth: baseSecondary + 260, desiredStorageCount: Math.max(2, recipe.desiredStorageCount || 3), desiredAisleCount: Math.max(2, recipe.desiredAisleCount || 2), shippingBufferRatio: planningIntent?.operation_profile?.loading_area_required ? 0.18 : 0.1, shippingBufferMaxRatio: 0.2, shippingBufferCapMm: 1400, boundaryBuffer: 180, preserveBoundaryInspectionAisle: true, summary: '放大主次走道與邊界安全帶，保留完整出貨緩衝，適合穩健通行。' });
  if (preset.recipe === 'efficiency') Object.assign(recipe, { mainAisleAxis: ['north', 'south'].includes(recipe.prioritizeEntrySide) ? 'horizontal' : 'vertical', primaryAisleWidth: basePrimary + 140, secondaryAisleWidth: baseSecondary + 60, desiredStorageCount: Math.max(3, recipe.desiredStorageCount || 4), desiredAisleCount: Math.max(2, recipe.desiredAisleCount || 2), shippingBufferRatio: planningIntent?.operation_profile?.loading_area_required ? 0.14 : 0.08, shippingBufferMaxRatio: 0.16, shippingBufferCapMm: 1100, boundaryBuffer: 90, prioritizeFastMoving: true, summary: '入口導向主走道與高頻區，兼顧出貨緩衝與動線效率。' });
  if (preset.recipe === 'density') Object.assign(recipe, { primaryAisleWidth: Math.max(1400, basePrimary - 200), secondaryAisleWidth: Math.max(900, baseSecondary - 180), desiredStorageCount: Math.max(4, recipe.desiredStorageCount || 5), desiredAisleCount: Math.max(1, recipe.desiredAisleCount || 1), shippingBufferRatio: planningIntent?.operation_profile?.loading_area_required ? 0.1 : 0.05, shippingBufferMaxRatio: 0.12, shippingBufferCapMm: 900, boundaryBuffer: 40, denseSplitRounds: 2, summary: '縮小走道與緩衝尺度，把更多面積回收到儲位區，容量最高。' });
  recipe.layout_signature = { aisle_policy: preset.recipe === 'density' ? 'compact' : preset.recipe === 'efficiency' ? 'entry_directed' : 'wide_safe', storage_split_policy: preset.recipe === 'density' ? 'dense_multi_split' : preset.recipe === 'efficiency' ? 'balanced_with_hot_zone' : 'low_density_safe_split', safety_policy: preset.recipe === 'conservative' ? 'expanded_clearance' : preset.recipe === 'density' ? 'minimum_clearance' : 'standard_clearance', entry_side_strategy: recipe.prioritizeEntrySide, buffer_strategy: preset.recipe === 'conservative' ? 'full_reserve' : preset.recipe === 'efficiency' ? 'entry_aligned' : 'compact_reserve' };
  return recipe;
}

function applyQuickTargets(layoutPlan, planningIntent, plannerConstraints, containerConfig, recipe) {
  let aisleCount = (layoutPlan.zones || []).filter((zone) => zone.zoneCategory === 'accessible_path').length;
  let guard = 0;
  while (aisleCount < Math.max(0, recipe.desiredAisleCount) && guard < 8) {
    if (!carveAisle(layoutPlan, containerConfig, aisleCount, recipe)) break;
    aisleCount = (layoutPlan.zones || []).filter((zone) => zone.zoneCategory === 'accessible_path').length;
    guard += 1;
  }
  let currentPrimary = (layoutPlan.zones || []).filter((zone) => isPrimaryStorage(zone)).length;
  const orientation = recipe.mainAisleAxis === 'vertical' ? 'horizontal' : 'vertical';
  guard = 0;
  while (currentPrimary < Math.max(0, recipe.desiredStorageCount) && guard < 14) {
    const target = findLargestSplittableZone(layoutPlan, orientation, 0);
    if (!target || !splitZone(layoutPlan, target.zone, orientation, guard + 1)) break;
    currentPrimary = (layoutPlan.zones || []).filter((zone) => isPrimaryStorage(zone)).length;
    guard += 1;
  }
  if (recipe.denseSplitRounds) {
    for (let index = 0; index < recipe.denseSplitRounds; index += 1) {
      const target = findLargestSplittableZone(layoutPlan, orientation, 0);
      if (!target) break;
      splitZone(layoutPlan, target.zone, orientation, `dense_${index}`);
    }
  }
  const usable = (layoutPlan.zones || []).filter((zone) => zone.type === 'usable').sort((a, b) => rectArea(b) - rectArea(a));
  usable.slice(0, recipe.desiredStorageCount || usable.length).forEach((zone, index) => {
    zone.label = `儲位區 ${pad(index + 1)}`;
    zone.name = zone.label;
    zone.metadata = { ...(zone.metadata || {}), preserveLabel: true, quickTarget: 'storage_zone_count' };
  });
  plannerConstraints.trace = { ...(plannerConstraints.trace || {}), quick_targets: { storage_zone_count: recipe.desiredStorageCount, aisle_count: recipe.desiredAisleCount }, entry_side: planningIntent?.warehouse?.entrances?.[0]?.side || 'south', loading_area_required: Boolean(planningIntent?.operation_profile?.loading_area_required) };
  layoutPlan.intent_trace = { requested_storage_zone_count: recipe.desiredStorageCount, requested_aisle_count: recipe.desiredAisleCount, generated_storage_zone_count: (layoutPlan.zones || []).filter((zone) => zone.metadata?.quickTarget === 'storage_zone_count').length, generated_aisle_count: (layoutPlan.zones || []).filter((zone) => zone.zoneCategory === 'accessible_path').length, shipping_buffer_enabled: Boolean(planningIntent?.operation_profile?.loading_area_required), entry_side: planningIntent?.warehouse?.entrances?.[0]?.side || 'south', handling_mode: planningIntent?.operation_profile?.handling_mode || 'manual', goods_type: planningIntent?.storage_profile?.goods_type || 'carton', rack_mode: planningIntent?.storage_profile?.rack_mode || 'shelf', recipe: recipe.key, layout_signature: recipe.layout_signature };
}

function applyRecipeDecorations(layoutPlan, planningIntent, recipe, containerConfig) {
  const zones = layoutPlan?.zones || [];
  if (recipe.boundaryBuffer > 0) {
    const boundaryZone = createRectZone({
      id: `${recipe.id}_boundary_buffer`,
      type: 'unusable_clearance',
      zoneCategory: 'safety_buffer',
      subtype: 'boundary_buffer',
      rect: { x: 0, z: 0, width: containerConfig.widthX, depth: Math.min(recipe.boundaryBuffer, Math.round(containerConfig.depthZ * 0.14)) },
      depth: containerConfig.heightY,
      label: '邊界安全帶',
      metadata: { preserveLabel: true, recipe: recipe.id, physicalReserved: true }
    });
    zones.push(boundaryZone);
    reservePhysicalZone(
      layoutPlan,
      boundaryZone,
      (zone) => zone?.id !== boundaryZone.id && (zone?.type === 'usable' || zone?.zoneCategory === 'accessible_path')
    );
  }
}

function buildAlignmentSummary(planningIntent, layoutPlan, preset) {
  const trace = layoutPlan?.intent_trace || {};
  const details = [
    `空間 ${planningIntent?.warehouse?.dimensions?.length_mm || 0} x ${planningIntent?.warehouse?.dimensions?.width_mm || 0} mm`,
    `入口 ${ENTRY_LABELS[trace.entry_side || planningIntent?.warehouse?.entrances?.[0]?.side || 'south'] || '南側'}`,
    trace.requested_storage_zone_count ? `儲位區 ${trace.requested_storage_zone_count}` : null,
    trace.generated_aisle_count ? `走道 ${trace.generated_aisle_count}` : null,
    planningIntent?.operation_profile?.loading_area_required ? '保留出貨 / 暫存區' : null,
    planningIntent?.planning_preferences?.keep_fast_moving_near_entry ? '熱門貨靠近入口' : null,
    `搬運 ${HANDLING_LABELS[trace.handling_mode || planningIntent?.operation_profile?.handling_mode || 'manual'] || '人工'}`,
    `貨型 ${GOODS_LABELS[trace.goods_type || planningIntent?.storage_profile?.goods_type || 'carton'] || '紙箱 / 箱件'}`,
    `設備 ${RACK_LABELS[trace.rack_mode || planningIntent?.storage_profile?.rack_mode || 'shelf'] || '層架'}`
  ].filter(Boolean);
  return `${preset.label}：${details.join('、')}。${PRESETS[preset.id]?.recipe === 'conservative' ? '以安全距離與完整緩衝為主。' : PRESETS[preset.id]?.recipe === 'efficiency' ? '以入口導向與高頻動線優先。' : '以高容量與緊湊儲位優先。'}`;
}

export function generatePlanningCandidates(planningIntent, options = {}) {
  const presetIds = options.presetIds || ['balanced', 'high_efficiency', 'high_density'];
  const constraintPatch = options.constraintPatch || null;
  const zonePatches = [...deriveIntentZonePatches(planningIntent), ...(options.zonePatches || [])];
  const builder = buildPlanningConstraints(planningIntent);
  const candidates = presetIds.map((presetId) => PRESETS[presetId]).filter(Boolean).map((preset) => {
    const recipe = createRecipeForPreset(preset, planningIntent, builder.container_config);
    const tunedZonePatches = tuneZonePatchesForRecipe(zonePatches, recipe, builder.container_config);
    let containerConfig = mergePlanning(builder.container_config, { ...preset.planningPatch, primaryAisleWidth: recipe.primaryAisleWidth, secondaryAisleWidth: recipe.secondaryAisleWidth, mainAisleAxis: recipe.mainAisleAxis, safetyBuffer: Math.max(Number(builder.container_config?.planning?.safetyBuffer) || 280, recipe.boundaryBuffer + 120) });
    if (constraintPatch?.planning) containerConfig = mergePlanning(containerConfig, constraintPatch.planning);
    const plannerConstraints = deepMerge({ ...builder.planner_constraints, planning: containerConfig.planning }, constraintPatch || {});
    const layoutPlan = buildWarehouseLayoutPlan(containerConfig, plannerConstraints);
    applyRecipeDecorations(layoutPlan, planningIntent, recipe, containerConfig);
    applyQuickTargets(layoutPlan, planningIntent, plannerConstraints, containerConfig, recipe);
    applyZonePatches(layoutPlan, planningIntent, tunedZonePatches);
    relabelZones(layoutPlan);
    const scorecard = buildPlanningScorecard(layoutPlan, planningIntent);
    const explanation = buildPlanningExplanation({ planningIntent, scorecard, assumptions: builder.assumptions, layoutPlan });
    explanation.summary = [buildAlignmentSummary(planningIntent, layoutPlan, preset), recipe.summary, ...(explanation.summary || [])].filter(Boolean);
    explanation.reasoning = [recipe.summary, `走道策略：${recipe.layout_signature.aisle_policy}`, `緩衝策略：${recipe.layout_signature.buffer_strategy}`];
    return { id: preset.id, label: preset.label, layout_plan: layoutPlan, scorecard, explanation, assumptions: builder.assumptions, container_config: containerConfig, planner_constraints: plannerConstraints, layout_signature: recipe.layout_signature };
  }).sort((a, b) => (b.scorecard?.total_score || 0) - (a.scorecard?.total_score || 0));
  return { planning_intent: builder.planning_intent, assumptions: builder.assumptions, candidates, selected_candidate_id: candidates[0]?.id || null };
}
