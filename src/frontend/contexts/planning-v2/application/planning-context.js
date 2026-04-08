import { warehousePlanningV2Service } from './warehouse-planning-v2-service.js';
import {
  GENERATION_STRATEGIES,
  createGeneratePlanCommand,
  createPlanGeneratedEvent
} from '../contracts/planning-v2-messages.js';

function hashText(value = '') {
  return [...String(value)].reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function resolvePresetId(generateCommand) {
  if (generateCommand.strategy === GENERATION_STRATEGIES.BALANCED) return 'balanced';
  if (generateCommand.strategy === GENERATION_STRATEGIES.HIGH_DENSITY) return 'high_density';
  if (generateCommand.strategy === GENERATION_STRATEGIES.HIGH_EFFICIENCY) return 'high_efficiency';
  if (generateCommand.strategy === GENERATION_STRATEGIES.RECOMMENDED_START) {
    const intent = generateCommand.planningIntent?.normalizedIntent;
    if (intent?.planning_preferences?.keep_fast_moving_near_entry) return 'high_efficiency';
    if (intent?.storage_profile?.goods_type === 'pallet') return 'balanced';
    if (intent?.operation_profile?.handling_mode === 'manual') return 'balanced';
    return 'high_density';
  }
  if (generateCommand.strategy === GENERATION_STRATEGIES.GUIDED_RANDOM_START) {
    const presets = ['balanced', 'high_density', 'high_efficiency'];
    const seed = hashText(generateCommand.deterministicSeed || generateCommand.planningIntent?.rawText || '');
    return presets[seed % presets.length];
  }
  return 'balanced';
}

function resolvePresetIds(generateCommand) {
  if (generateCommand.strategy === GENERATION_STRATEGIES.BALANCED) return ['balanced'];
  if (generateCommand.strategy === GENERATION_STRATEGIES.HIGH_DENSITY) return ['high_density'];
  if (generateCommand.strategy === GENERATION_STRATEGIES.HIGH_EFFICIENCY) return ['high_efficiency'];
  if (generateCommand.strategy === GENERATION_STRATEGIES.GUIDED_RANDOM_START) {
    const primary = resolvePresetId(generateCommand);
    return [primary, ...['balanced', 'high_efficiency', 'high_density'].filter((presetId) => presetId !== primary)];
  }
  if (generateCommand.strategy === GENERATION_STRATEGIES.RECOMMENDED_START) {
    const primary = resolvePresetId(generateCommand);
    return [primary, ...['balanced', 'high_efficiency', 'high_density'].filter((presetId) => presetId !== primary)];
  }
  return ['balanced', 'high_efficiency', 'high_density'];
}

function buildReasoning(result, presetId, strategy) {
  const summary = result?.selected_candidate?.explanation?.summary || [];
  return [
    `strategy:${strategy}`,
    `preset:${presetId}`,
    ...summary
  ];
}

export function buildGeneratePlanCommandFromIntent(captureResult, overrides = {}) {
  return createGeneratePlanCommand({
    ...captureResult.recommendedGenerateCommand,
    ...overrides
  });
}

export async function executeGeneratePlan(generateCommand) {
  const presetIds = resolvePresetIds(generateCommand);
  const presetId = presetIds[0];
  const result = warehousePlanningV2Service.generateFromIntent(
    generateCommand.planningIntent.normalizedIntent,
    {
      presetIds,
      historyReason: `command:${generateCommand.strategy}`,
      constraint_patch: generateCommand.constraintPatch || null,
      zone_patches: generateCommand.zonePatches || [],
      prompt_debug: generateCommand.promptDebug || null
    }
  );

  const event = createPlanGeneratedEvent({
    planId: result.selected_candidate_id,
    candidateIds: (result.candidates || []).map((candidate) => candidate.id),
    summary: result.selected_candidate?.explanation?.summary?.[0] || '已產生新方案',
    reasoning: buildReasoning(result, presetId, generateCommand.strategy),
    derivedFrom: generateCommand.basedOnPlanId,
    generationMode: generateCommand.strategy
  });

  return { result, event, command: generateCommand };
}
