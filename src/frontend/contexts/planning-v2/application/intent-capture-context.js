import { resolveNaturalLanguageIntent, deepMerge } from '../domain/nlu-router.js?v=4';
import { normalizePlanningIntent } from '../domain/planning-intent.js';
import { parsePlanningRequirements } from '../domain/requirement-parser.js';
import {
  CAPTURE_MODES,
  GENERATION_STRATEGIES,
  INTENT_MODES,
  createCaptureIntentCommand,
  createGeneratePlanCommand,
  createPlanningIntentMessage,
  inferCaptureMode,
  inferIntentMode,
  isColdStartText
} from '../contracts/planning-v2-messages.js';

function buildUserGoal(command, parsed) {
  return command.rawText || parsed?.planning_intent?.natural_language_prompt || '使用者希望先看到一版可調整的方案';
}

function buildSpaceProfile(intent) {
  return {
    shape: intent.warehouse.shape,
    dimensions: { ...intent.warehouse.dimensions },
    entrances: [...(intent.warehouse.entrances || [])]
  };
}

function buildFlowPreferences(intent) {
  return {
    entrySide: intent.warehouse.entrances?.[0]?.side || 'south',
    handlingMode: intent.operation_profile.handling_mode,
    pickingMode: intent.operation_profile.picking_mode,
    shippingFrequency: intent.operation_profile.shipping_frequency,
    aisleTarget: intent.planning_preferences?.quick_targets?.aisle_count || null
  };
}

function buildStoragePreferences(intent) {
  return {
    goodsType: intent.storage_profile.goods_type,
    rackMode: intent.storage_profile.rack_mode,
    skuDensity: intent.storage_profile.sku_density,
    storageZoneTarget: intent.planning_preferences?.quick_targets?.storage_zone_count || null,
    keepFastMovingNearEntry: intent.planning_preferences.keep_fast_moving_near_entry
  };
}

function buildConstraints(intent) {
  return {
    loadingAreaRequired: intent.operation_profile.loading_area_required,
    reserveExpansionArea: intent.planning_preferences.reserve_expansion_area,
    safetyZoneCount: intent.warehouse.safety_zones?.length || 0
  };
}

function determineRoute(command, intentMode) {
  if (command.mode === CAPTURE_MODES.REFINE) {
    return 'refinement';
  }
  if (intentMode === INTENT_MODES.RECOMMENDATION) {
    return 'recommendation';
  }
  return 'planning';
}

function determineStarterStrategy(command, intentMessage) {
  if (command.source === 'random_start') {
    return GENERATION_STRATEGIES.GUIDED_RANDOM_START;
  }
  if (intentMessage.intentMode === INTENT_MODES.RECOMMENDATION || isColdStartText(command.rawText)) {
    return GENERATION_STRATEGIES.RECOMMENDED_START;
  }
  return intentMessage.normalizedIntent?.planning_preferences?.preferred_layout_style || GENERATION_STRATEGIES.BALANCED;
}

export async function capturePlanningIntent({
  rawText = '',
  source = 'search_box',
  answers = {},
  currentPlanId = null,
  currentIntentSnapshot = null
} = {}) {
  const command = createCaptureIntentCommand({
    rawText,
    source,
    currentPlanId,
    currentIntentSnapshot,
    mode: inferCaptureMode(rawText, currentPlanId, source)
  });

  const parsed = parsePlanningRequirements({ answers, prompt: command.rawText });
  const intentBeforeNlu = normalizePlanningIntent(parsed.planning_intent);
  let nluResult = null;

  if (command.rawText) {
    nluResult = await resolveNaturalLanguageIntent(command.rawText, {
      intent: currentIntentSnapshot,
      zones: [],
      containerConfig: null
    });

    if (nluResult?.delta && Object.keys(nluResult.delta).length) {
      deepMerge(parsed.planning_intent, nluResult.delta);
    }

    if (nluResult?.dimension_patch) {
      const dims = parsed.planning_intent.warehouse.dimensions;
      if (nluResult.dimension_patch.length_mm) dims.length_mm = nluResult.dimension_patch.length_mm;
      if (nluResult.dimension_patch.width_mm) dims.width_mm = nluResult.dimension_patch.width_mm;
      if (nluResult.dimension_patch.height_mm) dims.height_mm = nluResult.dimension_patch.height_mm;
    }

    if (nluResult?.constraint_patch) {
      parsed.constraint_patch = deepMerge(parsed.constraint_patch || {}, nluResult.constraint_patch);
    }

    if (Array.isArray(nluResult?.zone_patches) && nluResult.zone_patches.length) {
      parsed.zone_patches = [...(parsed.zone_patches || []), ...nluResult.zone_patches];
    }
  }

  const normalizedIntent = normalizePlanningIntent(parsed.planning_intent);
  const intentMode = inferIntentMode(command.mode, command.rawText);
  const confidence = nluResult?.confidence || (command.mode === CAPTURE_MODES.COLD_START ? 0.76 : 0.88);
  const planningIntentMessage = createPlanningIntentMessage({
    userGoal: buildUserGoal(command, parsed),
    spaceProfile: buildSpaceProfile(normalizedIntent),
    flowPreferences: buildFlowPreferences(normalizedIntent),
    storagePreferences: buildStoragePreferences(normalizedIntent),
    constraints: buildConstraints(normalizedIntent),
    assumptions: parsed.assumptions || [],
    confidence,
    intentMode,
    normalizedIntent,
    rawText: command.rawText,
    source,
    route: determineRoute(command, intentMode)
  });

  return {
    captureCommand: command,
    parsedResult: {
      ...parsed,
      planning_intent: normalizedIntent,
      intent_before_nlu: intentBeforeNlu,
      nlu_result: nluResult
    },
    planningIntentMessage,
    recommendedGenerateCommand: createGeneratePlanCommand({
      planningIntent: planningIntentMessage,
      strategy: determineStarterStrategy(command, planningIntentMessage),
      basedOnPlanId: currentPlanId,
      preserveExistingLayout: command.mode === CAPTURE_MODES.REFINE,
      deterministicSeed: `${source}:${command.rawText || 'starter'}`,
      constraintPatch: parsed.constraint_patch || null,
      zonePatches: parsed.zone_patches || [],
      promptDebug: {
        prompt: command.rawText,
        intent_before_nlu: intentBeforeNlu,
        intent_after_nlu: normalizedIntent,
        nlu_result: nluResult
      }
    })
  };
}
