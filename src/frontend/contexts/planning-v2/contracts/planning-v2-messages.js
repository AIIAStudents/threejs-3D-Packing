/**
 * Planning V2 message contract.
 * This file is the readable spec for cross-context communication.
 */

const COLD_START_PATTERNS = [
  /我沒有概念/,
  /先給我一版/,
  /幫我推薦/,
  /先試一版/,
  /沒靈感/,
  /recommended start/i,
  /guided random start/i
];

const REFINE_PATTERNS = [
  /窄一些/,
  /寬一些/,
  /大一點/,
  /小一點/,
  /增加/,
  /減少/,
  /調整/,
  /微調/,
  /靠近入口/,
  /保留出貨/,
  /高頻區/,
  /主走道/,
  /次走道/
];

export const CAPTURE_SOURCES = Object.freeze({
  SEARCH_BOX: 'search_box',
  WIZARD: 'wizard',
  RANDOM_START: 'random_start'
});

export const CAPTURE_MODES = Object.freeze({
  COLD_START: 'cold_start',
  REFINE: 'refine',
  UNKNOWN: 'unknown'
});

export const INTENT_MODES = Object.freeze({
  RECOMMENDATION: 'recommendation',
  EXPLICIT_REQUEST: 'explicit_request',
  REFINEMENT: 'refinement'
});

export const GENERATION_STRATEGIES = Object.freeze({
  BALANCED: 'balanced',
  HIGH_DENSITY: 'high_density',
  HIGH_EFFICIENCY: 'high_efficiency',
  RECOMMENDED_START: 'recommended_start',
  GUIDED_RANDOM_START: 'guided_random_start'
});

export function isColdStartText(rawText = '') {
  return COLD_START_PATTERNS.some((pattern) => pattern.test(String(rawText || '').trim()));
}

export function isRefineText(rawText = '', currentPlanId = null) {
  return Boolean(currentPlanId) && REFINE_PATTERNS.some((pattern) => pattern.test(String(rawText || '').trim()));
}

export function inferCaptureMode(rawText = '', currentPlanId = null, source = CAPTURE_SOURCES.SEARCH_BOX) {
  if (source === CAPTURE_SOURCES.RANDOM_START) {
    return CAPTURE_MODES.COLD_START;
  }
  if (isColdStartText(rawText)) {
    return CAPTURE_MODES.COLD_START;
  }
  if (isRefineText(rawText, currentPlanId)) {
    return CAPTURE_MODES.REFINE;
  }
  return CAPTURE_MODES.UNKNOWN;
}

export function inferIntentMode(captureMode, rawText = '') {
  if (captureMode === CAPTURE_MODES.REFINE) {
    return INTENT_MODES.REFINEMENT;
  }
  if (captureMode === CAPTURE_MODES.COLD_START || isColdStartText(rawText)) {
    return INTENT_MODES.RECOMMENDATION;
  }
  return INTENT_MODES.EXPLICIT_REQUEST;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createCaptureIntentCommand({
  rawText = '',
  source = CAPTURE_SOURCES.SEARCH_BOX,
  mode = CAPTURE_MODES.UNKNOWN,
  currentPlanId = null,
  currentIntentSnapshot = null,
  timestamp = new Date().toISOString()
} = {}) {
  return {
    type: 'CaptureIntentCommand',
    rawText: String(rawText || '').trim(),
    source,
    mode,
    currentPlanId,
    currentIntentSnapshot: clone(currentIntentSnapshot),
    timestamp
  };
}

export function createPlanningIntentMessage({
  userGoal = '',
  spaceProfile = {},
  flowPreferences = {},
  storagePreferences = {},
  constraints = {},
  assumptions = [],
  confidence = 0,
  intentMode = INTENT_MODES.EXPLICIT_REQUEST,
  normalizedIntent = null,
  rawText = '',
  source = CAPTURE_SOURCES.SEARCH_BOX,
  route = 'planning'
} = {}) {
  return {
    type: 'PlanningIntentMessage',
    userGoal,
    spaceProfile,
    flowPreferences,
    storagePreferences,
    constraints,
    assumptions,
    confidence,
    intentMode,
    normalizedIntent: clone(normalizedIntent),
    rawText,
    source,
    route
  };
}

export function createGeneratePlanCommand({
  planningIntent,
  strategy = GENERATION_STRATEGIES.BALANCED,
  basedOnPlanId = null,
  preserveExistingLayout = false,
  deterministicSeed = '',
  constraintPatch = null,
  zonePatches = [],
  promptDebug = null
} = {}) {
  return {
    type: 'GeneratePlanCommand',
    planningIntent,
    strategy,
    basedOnPlanId,
    preserveExistingLayout,
    deterministicSeed,
    constraintPatch: clone(constraintPatch),
    zonePatches: clone(zonePatches || []),
    promptDebug: clone(promptDebug)
  };
}

export function createRefinePlanCommand({
  planId = null,
  refineText = '',
  parsedDelta = null,
  preserveZones = true,
  preserveAisles = true,
  preserveShippingBuffer = true,
  currentIntentSnapshot = null,
  promptDebug = null
} = {}) {
  return {
    type: 'RefinePlanCommand',
    planId,
    refineText,
    parsedDelta: clone(parsedDelta),
    preserveZones,
    preserveAisles,
    preserveShippingBuffer,
    currentIntentSnapshot: clone(currentIntentSnapshot),
    promptDebug: clone(promptDebug)
  };
}

export function createPlanGeneratedEvent({
  planId = null,
  candidateIds = [],
  summary = '',
  reasoning = [],
  derivedFrom = null,
  generationMode = GENERATION_STRATEGIES.BALANCED
} = {}) {
  return {
    type: 'PlanGeneratedEvent',
    planId,
    candidateIds,
    summary,
    reasoning,
    derivedFrom,
    generationMode
  };
}

export function createPlanRefinedEvent({
  planId = null,
  previousPlanId = null,
  appliedChanges = [],
  summary = '',
  reasoning = []
} = {}) {
  return {
    type: 'PlanRefinedEvent',
    planId,
    previousPlanId,
    appliedChanges,
    summary,
    reasoning
  };
}

export const PLANNING_V2_BOUNDED_CONTEXTS = Object.freeze({
  intentCapture: {
    name: 'Intent Capture Context',
    responsibility: 'Receive search-like language, detect cold start vs refine, and emit PlanningIntentMessage.'
  },
  planning: {
    name: 'Planning Context',
    responsibility: 'Generate candidates and maintain current plan aggregate from GeneratePlanCommand.'
  },
  refinement: {
    name: 'Refinement Context',
    responsibility: 'Apply incremental delta against current plan and emit PlanRefinedEvent.'
  },
  presentation: {
    name: 'Presentation Context',
    responsibility: 'Render search box, wizard, canvas, and show current routing mode without owning domain rules.'
  }
});
