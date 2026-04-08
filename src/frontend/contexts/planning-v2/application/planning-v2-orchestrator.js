import {
  CAPTURE_MODES,
  CAPTURE_SOURCES,
  GENERATION_STRATEGIES
} from '../contracts/planning-v2-messages.js';
import { planningV2SessionRepository } from './planning-v2-session-repository.js';
import { capturePlanningIntent } from './intent-capture-context.js';
import { buildGeneratePlanCommandFromIntent, executeGeneratePlan } from './planning-context.js';
import { buildRefinePlanCommand, executeRefinement } from './refinement-context.js';
import { warehousePlanningV2Service } from './warehouse-planning-v2-service.js';

function readCurrentAggregate() {
  const initialState = planningV2SessionRepository.loadInitialState();
  const latestResult = initialState.latestResult;
  return {
    currentPlanId: latestResult?.selected_candidate_id || null,
    currentIntentSnapshot: latestResult?.planning_intent || initialState.draft || null,
    currentResult: latestResult || null
  };
}

function resolveUiModeLabel(command, route) {
  if (command.mode === CAPTURE_MODES.REFINE || route === 'refinement') {
    return { code: 'refine', label: '\u6839\u64da\u76ee\u524d\u65b9\u6848\u5fae\u8abf' };
  }
  if (command.mode === CAPTURE_MODES.COLD_START || route === 'recommendation') {
    return { code: 'recommended_start', label: '\u63a8\u85a6\u8d77\u624b\u5f0f' };
  }
  return { code: 'explicit_request', label: '\u76f4\u63a5\u9700\u6c42\u89e3\u8b6f' };
}

export const planningV2Orchestrator = {
  getCurrentAggregate() {
    return readCurrentAggregate();
  },

  async handleSearchRequest({
    rawText = '',
    answers = {},
    source = CAPTURE_SOURCES.SEARCH_BOX,
    currentPlanId = null,
    currentIntentSnapshot = null,
    currentResult = null
  } = {}) {
    const baseAggregate = readCurrentAggregate();
    const aggregate = {
      ...baseAggregate,
      currentPlanId: currentPlanId || baseAggregate.currentPlanId,
      currentIntentSnapshot: currentIntentSnapshot || baseAggregate.currentIntentSnapshot,
      currentResult: currentResult || baseAggregate.currentResult
    };

    const captureResult = await capturePlanningIntent({
      rawText,
      source,
      answers,
      currentPlanId: aggregate.currentPlanId,
      currentIntentSnapshot: aggregate.currentIntentSnapshot
    });

    const route = captureResult.planningIntentMessage.route;
    const uiMode = resolveUiModeLabel(captureResult.captureCommand, route);

    if (route === 'refinement' && (aggregate.currentPlanId || aggregate.currentResult?.selected_candidate?.id)) {
      const refineCommand = buildRefinePlanCommand({
        planId: aggregate.currentPlanId || aggregate.currentResult?.selected_candidate?.id,
        refineText: rawText,
        currentIntentSnapshot: aggregate.currentIntentSnapshot,
        parsedDelta: captureResult.parsedResult.nlu_result,
        promptDebug: captureResult.recommendedGenerateCommand.promptDebug
      });
      const refinement = await executeRefinement(refineCommand, aggregate.currentResult);
      return {
        capture: captureResult,
        uiMode,
        ...refinement
      };
    }

    const generateCommand = buildGeneratePlanCommandFromIntent(captureResult, {
      strategy: captureResult.recommendedGenerateCommand.strategy
    });
    const generation = await executeGeneratePlan(generateCommand);
    return {
      capture: captureResult,
      uiMode,
      ...generation
    };
  },

  async handleRecommendedStart({
    rawText = '',
    answers = {},
    guided = true,
    currentPlanId = null,
    currentIntentSnapshot = null
  } = {}) {
    const baseAggregate = readCurrentAggregate();
    const aggregate = {
      ...baseAggregate,
      currentPlanId: currentPlanId || baseAggregate.currentPlanId,
      currentIntentSnapshot: currentIntentSnapshot || baseAggregate.currentIntentSnapshot
    };
    const captureResult = await capturePlanningIntent({
      rawText,
      source: CAPTURE_SOURCES.RANDOM_START,
      answers,
      currentPlanId: aggregate.currentPlanId,
      currentIntentSnapshot: aggregate.currentIntentSnapshot
    });
    const generateCommand = buildGeneratePlanCommandFromIntent(captureResult, {
      strategy: guided ? GENERATION_STRATEGIES.GUIDED_RANDOM_START : GENERATION_STRATEGIES.RECOMMENDED_START,
      basedOnPlanId: aggregate.currentPlanId,
      preserveExistingLayout: false
    });
    const generation = await executeGeneratePlan(generateCommand);
    return {
      capture: captureResult,
      uiMode: {
        code: generateCommand.strategy,
        label: guided ? '\u5f15\u5c0e\u5f0f\u8d77\u624b\u5f0f' : '\u63a8\u85a6\u8d77\u624b\u5f0f'
      },
      ...generation
    };
  },

  selectCandidate(result, candidateId) {
    return planningV2SessionRepository.selectCandidate(result, candidateId);
  },

  buildPreviewData(candidateResult) {
    return warehousePlanningV2Service.buildPreviewData(candidateResult);
  },

  saveDraft(draft) {
    return planningV2SessionRepository.saveDraft(draft);
  },
};
