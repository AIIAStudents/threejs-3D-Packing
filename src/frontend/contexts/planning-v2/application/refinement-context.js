import { deepMerge, resolveNaturalLanguageIntent } from '../domain/nlu-router.js?v=4';
import { normalizePlanningIntent } from '../domain/planning-intent.js';
import { warehousePlanningV2Service } from './warehouse-planning-v2-service.js';
import { createPlanRefinedEvent, createRefinePlanCommand } from '../contracts/planning-v2-messages.js';

function summarizeAppliedChanges(command, nextIntent) {
  const changes = [];
  const directives = nextIntent?.planning_preferences?.semantic_directives || {};
  if (directives.main_aisle_mode) changes.push(`main_aisle_mode:${directives.main_aisle_mode}`);
  if (nextIntent?.planning_preferences?.keep_fast_moving_near_entry) changes.push('fast_moving_near_entry');
  if (nextIntent?.planning_preferences?.reserve_expansion_area) changes.push('reserve_expansion_area');
  if (command.preserveShippingBuffer && nextIntent?.operation_profile?.loading_area_required) changes.push('preserve_shipping_buffer');
  return changes;
}

export function buildRefinePlanCommand({
  planId,
  refineText,
  currentIntentSnapshot,
  parsedDelta = null,
  promptDebug = null
} = {}) {
  return createRefinePlanCommand({
    planId,
    refineText,
    parsedDelta,
    preserveZones: true,
    preserveAisles: true,
    preserveShippingBuffer: true,
    currentIntentSnapshot,
    promptDebug
  });
}

export async function executeRefinement(refineCommand, currentResult = null) {
  const baseIntent = normalizePlanningIntent(refineCommand.currentIntentSnapshot);
  let nluResult = refineCommand.parsedDelta;

  if (!nluResult && refineCommand.refineText) {
    nluResult = await resolveNaturalLanguageIntent(refineCommand.refineText, {
      intent: baseIntent,
      containerConfig: currentResult?.selected_candidate?.container_config || null,
      zones: currentResult?.selected_candidate?.layout_plan?.zones || []
    });
  }

  if (!nluResult) {
    const result = await warehousePlanningV2Service.refineWithNlu({
      intent: baseIntent,
      userText: refineCommand.refineText
    });
    return {
      result,
      event: createPlanRefinedEvent({
        planId: result.selected_candidate_id,
        previousPlanId: refineCommand.planId,
        appliedChanges: [refineCommand.refineText || 'text_refinement'],
        summary: result.delta?.summary?.join('；') || '已根據目前方案微調',
        reasoning: [result.delta?.nlu_explanation || 'refineWithNlu fallback']
      }),
      command: refineCommand
    };
  }

  const nextIntent = normalizePlanningIntent(baseIntent);
  if (nluResult.delta && Object.keys(nluResult.delta).length) {
    deepMerge(nextIntent, nluResult.delta);
  }
  if (refineCommand.preserveShippingBuffer && baseIntent.operation_profile.loading_area_required) {
    nextIntent.operation_profile.loading_area_required = true;
  }
  if (refineCommand.preserveAisles && baseIntent.planning_preferences?.quick_targets?.aisle_count) {
    nextIntent.planning_preferences.quick_targets.aisle_count = baseIntent.planning_preferences.quick_targets.aisle_count;
  }

  const result = warehousePlanningV2Service.generateFromIntent(nextIntent, {
    presetIds: [currentResult?.selected_candidate?.preset_id || 'balanced'],
    historyReason: `refine:${refineCommand.refineText}`,
    constraint_patch: nluResult.constraint_patch || null,
    zone_patches: nluResult.zone_patches || [],
    prompt_debug: {
      ...(refineCommand.promptDebug || {}),
      prompt: refineCommand.refineText,
      parsed_delta: nluResult
    },
    nlu_result: nluResult
  });

  const event = createPlanRefinedEvent({
    planId: result.selected_candidate_id,
    previousPlanId: refineCommand.planId,
    appliedChanges: summarizeAppliedChanges(refineCommand, nextIntent),
    summary: result.selected_candidate?.explanation?.summary?.[0] || '已根據目前方案微調',
    reasoning: [nluResult.explanation || 'structured_delta_applied']
  });

  return { result, event, command: refineCommand };
}
