import {
  buildMissingFields,
  normalizePlanningIntent
} from './planning-intent.js';
import { parsePromptSemanticRules } from './prompt-semantic-rules.js';

function normalizePrompt(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') {
    return target;
  }

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    if (
      sourceValue &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], sourceValue);
    } else {
      target[key] = sourceValue;
    }
  });

  return target;
}

function toMillimeters(value) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    return null;
  }
  return Math.round(nextValue * 1000);
}

function parseDimensionsFromPrompt(prompt, patch, assumptions) {
  const sizeMatch = prompt.match(/(\d+(?:\.\d+)?)\s*[xX＊*]\s*(\d+(?:\.\d+)?)\s*(?:m|公尺|米)/i);
  if (sizeMatch) {
    patch.warehouse.dimensions.length_mm ??= toMillimeters(sizeMatch[1]);
    patch.warehouse.dimensions.width_mm ??= toMillimeters(sizeMatch[2]);
    assumptions.push({
      path: 'warehouse.dimensions',
      rule: 'inferred_from_prompt',
      value: `${sizeMatch[1]} x ${sizeMatch[2]} m`
    });
  }

  const heightMatch = prompt.match(/(?:高度|height)\s*(\d+(?:\.\d+)?)\s*(?:m|公尺|米)/i);
  if (heightMatch) {
    patch.warehouse.dimensions.height_mm ??= toMillimeters(heightMatch[1]);
    assumptions.push({
      path: 'warehouse.dimensions.height_mm',
      rule: 'inferred_from_prompt',
      value: `${heightMatch[1]} m`
    });
  }
}

function parseKeywordIntent(prompt, patch, assumptions) {
  if (/forklift|叉車/i.test(prompt)) {
    patch.operation_profile.handling_mode = 'forklift';
    assumptions.push({ path: 'operation_profile.handling_mode', rule: 'inferred_from_prompt', value: 'forklift' });
  } else if (/pallet jack|拖板車/i.test(prompt)) {
    patch.operation_profile.handling_mode = 'pallet_jack';
    assumptions.push({ path: 'operation_profile.handling_mode', rule: 'inferred_from_prompt', value: 'pallet_jack' });
  } else if (/manual|人工/i.test(prompt)) {
    patch.operation_profile.handling_mode = 'manual';
    assumptions.push({ path: 'operation_profile.handling_mode', rule: 'inferred_from_prompt', value: 'manual' });
  }

  if (/manual picking|人工揀貨/i.test(prompt)) {
    patch.operation_profile.picking_mode = 'manual';
  } else if (/wave|波次/i.test(prompt)) {
    patch.operation_profile.picking_mode = 'wave';
  } else if (/batch|批次/i.test(prompt)) {
    patch.operation_profile.picking_mode = 'batch';
  }

  if (/(紙箱|箱件|carton)/i.test(prompt) && /(棧板|pallet)/i.test(prompt)) {
    patch.storage_profile.goods_type = 'mixed';
  } else if (/(棧板|pallet)/i.test(prompt)) {
    patch.storage_profile.goods_type = 'pallet';
  } else if (/(紙箱|箱件|carton)/i.test(prompt)) {
    patch.storage_profile.goods_type = 'carton';
  }

  if (/(冷藏|冷凍)/i.test(prompt)) {
    patch.storage_profile.special_zones.push('cold_storage');
  }
  if (/(危險|hazard)/i.test(prompt)) {
    patch.storage_profile.special_zones.push('hazardous');
  }
  if (/(重貨|heavy)/i.test(prompt)) {
    patch.storage_profile.special_zones.push('heavy_goods');
  }

  if (/(逃生|escape)/i.test(prompt)) {
    patch.warehouse.safety_zones.push({
      id: 'escape_route_prompt',
      type: 'escape_route',
      polygon: []
    });
  }
  if (/(消防|fire)/i.test(prompt)) {
    patch.warehouse.safety_zones.push({
      id: 'fire_lane_prompt',
      type: 'fire_lane',
      polygon: []
    });
  }

  if (/(熱門貨|高頻貨|快取貨|快速出貨品).*(入口|出入口|靠門)|(入口|出入口|靠門).*(熱門貨|高頻貨|快取貨|快速出貨品)/i.test(prompt)) {
    patch.planning_preferences.keep_fast_moving_near_entry = true;
  }

  if (/(擴充|預留未來)/i.test(prompt)) {
    patch.planning_preferences.reserve_expansion_area = true;
  }

  if (/(高密度|容量優先)/i.test(prompt)) {
    patch.planning_preferences.objective = {
      storage_density: 0.55,
      picking_efficiency: 0.25,
      safety_margin: 0.2
    };
    patch.planning_preferences.preferred_layout_style = 'high_density';
  } else if (/(高效率|動線優先|揀貨效率)/i.test(prompt)) {
    patch.planning_preferences.objective = {
      storage_density: 0.25,
      picking_efficiency: 0.55,
      safety_margin: 0.2
    };
    patch.planning_preferences.preferred_layout_style = 'high_efficiency';
  } else if (/(保守|高安全|安全優先)/i.test(prompt)) {
    patch.planning_preferences.objective = {
      storage_density: 0.3,
      picking_efficiency: 0.28,
      safety_margin: 0.42
    };
    patch.planning_preferences.preferred_layout_style = 'conservative';
  }
}

function parseQuickTargetsFromPrompt(prompt, patch, assumptions) {
  const storageZoneMatch = prompt.match(/(\d+)\s*(?:個|個區|組)?\s*儲位區/);
  if (storageZoneMatch) {
    patch.planning_preferences.quick_targets.storage_zone_count = Number(storageZoneMatch[1]) || null;
    assumptions.push({
      path: 'planning_preferences.quick_targets.storage_zone_count',
      rule: 'inferred_from_prompt',
      value: `${storageZoneMatch[1]} storage zones`
    });
  }

  const aisleMatch = prompt.match(/(\d+)\s*(?:條)?\s*走道/);
  if (aisleMatch) {
    patch.planning_preferences.quick_targets.aisle_count = Number(aisleMatch[1]) || null;
    assumptions.push({
      path: 'planning_preferences.quick_targets.aisle_count',
      rule: 'inferred_from_prompt',
      value: `${aisleMatch[1]} aisles`
    });
  }
}

export function buildPlanningIntentFromAnswers(answers = {}) {
  const specialZones = [];
  if (answers.specialZoneCold) specialZones.push('cold_storage');
  if (answers.specialZoneHazardous) specialZones.push('hazardous');
  if (answers.specialZoneHeavy) specialZones.push('heavy_goods');

  const safetyZones = [];
  if (answers.escapeRouteRequired) {
    safetyZones.push({ id: 'escape_route_form', type: 'escape_route', polygon: [] });
  }
  if (answers.fireLaneRequired) {
    safetyZones.push({ id: 'fire_lane_form', type: 'fire_lane', polygon: [] });
  }

  const entrance = {
    id: 'entry_main',
    side: answers.entrySide || 'south',
    width_mm: Number(answers.entryWidthMm) || null,
    position_mm: Number(answers.entryPositionMm) || null,
    role: answers.entryRole || 'entry'
  };

  return normalizePlanningIntent({
    warehouse: {
      shape: answers.shape || 'rectangle',
      dimensions: {
        length_mm: Number(answers.lengthMm) || null,
        width_mm: Number(answers.widthMm) || null,
        height_mm: Number(answers.heightMm) || null
      },
      entrances: [entrance],
      safety_zones: safetyZones
    },
    operation_profile: {
      handling_mode: answers.handlingMode || 'manual',
      picking_mode: answers.pickingMode || 'manual',
      shipping_frequency: answers.shippingFrequency || 'medium',
      zoning_required: answers.zoningRequired !== false,
      loading_area_required: Boolean(answers.loadingAreaRequired),
      turning_space_required: Boolean(answers.turningSpaceRequired)
    },
    storage_profile: {
      goods_type: answers.goodsType || 'carton',
      rack_mode: answers.rackMode || 'shelf',
      stackable: answers.stackable !== false,
      fragile: Boolean(answers.fragile),
      sku_density: answers.skuDensity || 'medium',
      special_zones: specialZones
    },
    planning_preferences: {
      objective: {
        storage_density: Number(answers.objectiveStorageDensity) || 0.4,
        picking_efficiency: Number(answers.objectivePickingEfficiency) || 0.4,
        safety_margin: Number(answers.objectiveSafetyMargin) || 0.2
      },
      keep_fast_moving_near_entry: answers.keepFastMovingNearEntry !== false,
      reserve_expansion_area: Boolean(answers.reserveExpansionArea),
      preferred_layout_style: answers.preferredLayoutStyle || 'balanced',
      zoning_strategy: answers.zoningStrategy || 'auto',
      quick_targets: {
        storage_zone_count: Number(answers.quickStorageZoneCount) || null,
        aisle_count: Number(answers.quickAisleCount) || null
      }
    },
    natural_language_prompt: normalizePrompt(answers.naturalLanguagePrompt || '')
  });
}

export function parsePlanningRequirements({ answers = {}, prompt = '' } = {}) {
  const assumptions = [];
  const baseIntent = buildPlanningIntentFromAnswers({
    ...answers,
    naturalLanguagePrompt: prompt || answers.naturalLanguagePrompt || ''
  });
  const patch = normalizePlanningIntent(baseIntent);
  const normalizedPrompt = normalizePrompt(prompt || answers.naturalLanguagePrompt || '');

  if (normalizedPrompt) {
    parseDimensionsFromPrompt(normalizedPrompt, patch, assumptions);
    parseKeywordIntent(normalizedPrompt, patch, assumptions);
    parseQuickTargetsFromPrompt(normalizedPrompt, patch, assumptions);
  }

  const promptRules = parsePromptSemanticRules(normalizedPrompt);
  if (promptRules.matched) {
    deepMerge(patch, promptRules.intent_delta);
    patch.planning_preferences.semantic_directives.debug_matches = promptRules.debug_matches;
    assumptions.push({
      path: 'planning_preferences.semantic_directives',
      rule: 'deterministic_prompt_rules',
      value: promptRules.explanation.join(' / ')
    });
  }

  const planningIntent = normalizePlanningIntent(patch);
  return {
    planning_intent: planningIntent,
    missing_fields: buildMissingFields(planningIntent),
    assumptions,
    constraint_patch: promptRules.constraint_patch,
    zone_patches: promptRules.zone_patches,
    prompt_debug: {
      prompt: normalizedPrompt,
      rules_matched: promptRules.debug_matches,
      rule_explanation: promptRules.explanation,
      intent_delta: promptRules.intent_delta,
      constraint_patch: promptRules.constraint_patch,
      zone_patches: promptRules.zone_patches
    }
  };
}
