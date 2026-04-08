import { planningV2SessionRepository } from './planning-v2-session-repository.js';
import { generatePlanningCandidates } from '../domain/layout-generator.js';
import { resolveNaturalLanguageIntent, deepMerge } from '../domain/nlu-router.js?v=4';
import { normalizePlanningIntent } from '../domain/planning-intent.js';
import { buildPlanningViewerData } from '../domain/preview-projection.js';
import { applyRefineCommand, buildDeltaExplanation, normalizeRefineCommand } from '../domain/refinement-policy.js';
import { parsePlanningRequirements } from '../domain/requirement-parser.js';

function mergeGenerationOptions(...optionsList) {
  return optionsList.reduce((accumulator, entry) => {
    if (!entry) {
      return accumulator;
    }

    if (entry.constraint_patch) {
      accumulator.constraint_patch = deepMerge(accumulator.constraint_patch || {}, entry.constraint_patch);
    }

    if (Array.isArray(entry.zone_patches) && entry.zone_patches.length) {
      accumulator.zone_patches = [...(accumulator.zone_patches || []), ...entry.zone_patches];
    }

    if (entry.prompt_debug) {
      accumulator.prompt_debug = entry.prompt_debug;
    }

    if (entry.nlu_result) {
      accumulator.nlu_result = entry.nlu_result;
    }

    return accumulator;
  }, {
    constraint_patch: null,
    zone_patches: [],
    prompt_debug: null,
    nlu_result: null
  });
}

function logPlanningDebug(stage, payload) {
  console.groupCollapsed(`[PlanningV2][${stage}]`);
  Object.entries(payload || {}).forEach(([key, value]) => {
    console.log(key, value);
  });
  console.groupEnd();
}

export const warehousePlanningV2Service = {
  loadInitialState() {
    return planningV2SessionRepository.loadInitialState();
  },

  saveDraft(draft) {
    const normalizedDraft = normalizePlanningIntent(draft);
    return planningV2SessionRepository.saveDraft(normalizedDraft);
  },

  async parseRequirements({ answers = {}, prompt = '' } = {}) {
    const parsed = parsePlanningRequirements({ answers, prompt });
    const intentBeforeNlu = normalizePlanningIntent(parsed.planning_intent);
    let nluResult = null;

    if (prompt && prompt.trim()) {
      const currentState = this._buildCurrentNluState();
      nluResult = await resolveNaturalLanguageIntent(prompt, currentState);
      const shouldMergeRuleArtifacts = nluResult?.source !== 'rules';

      if (nluResult?.delta && Object.keys(nluResult.delta).length > 0) {
        deepMerge(parsed.planning_intent, nluResult.delta);
        parsed.assumptions.push({
          path: 'nlu',
          rule: 'inferred_from_prompt',
          value: `[${nluResult.source}] ${nluResult.explanation || nluResult.intent_id}`
        });
        parsed.nlu_result = nluResult;
      }

      if (shouldMergeRuleArtifacts && nluResult?.constraint_patch) {
        parsed.constraint_patch = deepMerge(parsed.constraint_patch || {}, nluResult.constraint_patch);
      }

      if (shouldMergeRuleArtifacts && Array.isArray(nluResult?.zone_patches) && nluResult.zone_patches.length) {
        parsed.zone_patches = [...(parsed.zone_patches || []), ...nluResult.zone_patches];
      }

      if (nluResult?.dimension_patch) {
        const dims = parsed.planning_intent.warehouse.dimensions;
        if (nluResult.dimension_patch.length_mm) dims.length_mm = nluResult.dimension_patch.length_mm;
        if (nluResult.dimension_patch.width_mm) dims.width_mm = nluResult.dimension_patch.width_mm;
        if (nluResult.dimension_patch.height_mm) dims.height_mm = nluResult.dimension_patch.height_mm;
      }
    }

    parsed.prompt_debug = {
      ...(parsed.prompt_debug || {}),
      prompt: prompt || answers.naturalLanguagePrompt || '',
      intent_before_nlu: intentBeforeNlu,
      intent_after_nlu: normalizePlanningIntent(parsed.planning_intent),
      final_constraint_patch: parsed.constraint_patch || null,
      final_zone_patches: parsed.zone_patches || [],
      nlu_result: nluResult
    };

    logPlanningDebug('parse', {
      prompt: parsed.prompt_debug.prompt,
      prompt_rules: parsed.prompt_debug.rules_matched || [],
      intent_before_nlu: parsed.prompt_debug.intent_before_nlu,
      nlu_delta: nluResult?.delta || null,
      intent_after_nlu: parsed.prompt_debug.intent_after_nlu,
      final_constraint_patch: parsed.prompt_debug.final_constraint_patch,
      final_zone_patches: parsed.prompt_debug.final_zone_patches
    });

    this._lastParsedIntent = parsed.planning_intent;
    this._lastPlanningDebug = parsed.prompt_debug;
    return parsed;
  },

  async generatePlan({ answers = {}, prompt = '', presetIds } = {}) {
    const parsed = await this.parseRequirements({ answers, prompt });
    return this.generateFromIntent(parsed.planning_intent, {
      presetIds,
      historyReason: presetIds?.length ? `preset:${presetIds[0]}` : 'generated',
      constraint_patch: parsed.constraint_patch,
      zone_patches: parsed.zone_patches,
      prompt_debug: parsed.prompt_debug,
      nlu_result: parsed.nlu_result || null
    });
  },

  completeParsedIntent(parsedResult, options = {}) {
    if (!parsedResult?.planning_intent) {
      throw new Error('[PlanningV2] Missing planning_intent after parse');
    }

    if (typeof this.generateFromIntent === 'function') {
      return this.generateFromIntent(parsedResult.planning_intent, {
        ...options,
        constraint_patch: parsedResult.constraint_patch || options.constraint_patch || null,
        zone_patches: parsedResult.zone_patches || options.zone_patches || [],
        prompt_debug: parsedResult.prompt_debug || options.prompt_debug || null,
        nlu_result: parsedResult.nlu_result || options.nlu_result || null
      });
    }

    return this.generatePlan({
      answers: options.answers || {},
      prompt: options.prompt || parsedResult.prompt_debug?.prompt || parsedResult.planning_intent?.natural_language_prompt || '',
      presetIds: options.presetIds
    });
  },

  generateFromIntent(intent, options = {}) {
    const {
      presetIds,
      historyReason = 'generated',
      constraint_patch = null,
      zone_patches = [],
      prompt_debug = null,
      nlu_result = null
    } = options;

    const normalizedIntent = normalizePlanningIntent(intent);
    const generationOptions = mergeGenerationOptions(
      { constraint_patch, zone_patches, prompt_debug, nlu_result },
      { prompt_debug: prompt_debug || this._lastPlanningDebug || null }
    );

    const generated = generatePlanningCandidates(normalizedIntent, {
      presetIds,
      constraintPatch: generationOptions.constraint_patch,
      zonePatches: generationOptions.zone_patches
    });
    const selected = planningV2SessionRepository.selectCandidateResult(generated, generated.selected_candidate_id);
    selected.planning_intent = normalizedIntent;
    selected.prompt_debug = generationOptions.prompt_debug || null;
    selected.nlu_result = generationOptions.nlu_result || null;
    selected.constraint_patch = generationOptions.constraint_patch || null;
    selected.zone_patches = generationOptions.zone_patches || [];
    selected.history = planningV2SessionRepository.appendHistory(selected, historyReason);
    planningV2SessionRepository.saveLatestResult(selected);

    logPlanningDebug('generate', {
      prompt: selected.prompt_debug?.prompt || '',
      planning_intent: normalizedIntent,
      semantic_rules: selected.prompt_debug?.rules_matched || [],
      final_constraint_patch: selected.constraint_patch,
      final_zone_patches: selected.zone_patches,
      selected_candidate: selected.selected_candidate?.id,
      planner_constraints: selected.selected_candidate?.planner_constraints,
      layout_intent_trace: selected.selected_candidate?.layout_plan?.intent_trace || null,
      projection_zones: (selected.selected_candidate?.layout_plan?.zones || []).map((zone) => ({
        id: zone.id,
        label: zone.label,
        type: zone.type,
        zoneCategory: zone.zoneCategory,
        subtype: zone.subtype,
        rect: zone.geometry_2d?.rect
      }))
    });

    return selected;
  },

  async refinePlan({ intent, command }) {
    const normalizedCommand = normalizeRefineCommand(command);
    const nextIntent = applyRefineCommand(intent, normalizedCommand);
    const previous = planningV2SessionRepository.loadLatestResult();

    const selected = this.generateFromIntent(nextIntent, {
      historyReason: `refine:${normalizedCommand}`
    });
    selected.delta = buildDeltaExplanation(previous, selected, normalizedCommand);
    selected.history = planningV2SessionRepository.appendHistory(selected, `refine:${normalizedCommand}`, selected.delta);
    planningV2SessionRepository.saveLatestResult(selected);
    return selected;
  },

  async refineWithNlu({ intent, userText }) {
    if (!intent) {
      return null;
    }

    const currentState = this._buildCurrentNluState();
    const nluResult = await resolveNaturalLanguageIntent(userText, currentState);

    if (!nluResult) {
      return this.refinePlan({ intent, command: userText });
    }

    const nextIntent = normalizePlanningIntent(intent);
    if (nluResult.delta && Object.keys(nluResult.delta).length > 0) {
      deepMerge(nextIntent, nluResult.delta);
    }

    if (nluResult.dimension_patch) {
      const dims = nextIntent.warehouse.dimensions;
      if (nluResult.dimension_patch.length_mm) dims.length_mm = nluResult.dimension_patch.length_mm;
      if (nluResult.dimension_patch.width_mm) dims.width_mm = nluResult.dimension_patch.width_mm;
      if (nluResult.dimension_patch.height_mm) dims.height_mm = nluResult.dimension_patch.height_mm;
    }

    const previous = planningV2SessionRepository.loadLatestResult();
    const selected = this.generateFromIntent(nextIntent, {
      historyReason: `nlu:${nluResult.intent_id}`,
      constraint_patch: nluResult.constraint_patch || null,
      zone_patches: nluResult.zone_patches || [],
      prompt_debug: {
        prompt: userText,
        rules_matched: this._lastPlanningDebug?.rules_matched || [],
        intent_before_nlu: normalizePlanningIntent(intent),
        intent_after_nlu: normalizePlanningIntent(nextIntent),
        final_constraint_patch: nluResult.constraint_patch || null,
        final_zone_patches: nluResult.zone_patches || [],
        nlu_result: nluResult
      },
      nlu_result: nluResult
    });
    selected.delta = buildDeltaExplanation(previous, selected, userText);
    selected.delta.nlu_explanation = nluResult.explanation;
    selected.history = planningV2SessionRepository.appendHistory(selected, `nlu:${nluResult.intent_id}`, selected.delta);
    planningV2SessionRepository.saveLatestResult(selected);
    return selected;
  },

  _buildCurrentNluState() {
    return planningV2SessionRepository.buildCurrentNluState(this._lastParsedIntent);
  },

  _lastParsedIntent: null,
  _lastPlanningDebug: null,

  selectCandidate(result, candidateId) {
    return planningV2SessionRepository.selectCandidate(result, candidateId);
  },

  buildPreviewData(candidateResult) {
    const candidate = candidateResult?.selected_candidate || candidateResult;
    return buildPlanningViewerData(candidate);
  },
};
