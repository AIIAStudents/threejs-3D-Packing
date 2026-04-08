import { matchSemanticIntent } from '../domain/semantic-intent-matcher.js';
import { parsePromptSemanticRules } from './prompt-semantic-rules.js';

const LOCAL_NLU_TIMEOUT_MS = 4000;

export function deepMerge(target, source) {
  if (!source || typeof source !== 'object') {
    return target;
  }

  for (const key of Object.keys(source)) {
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
  }

  return target;
}

export function clearConversationHistory() {
  // no-op
}

export function getConversationHistory() {
  return [];
}

export async function resolveNaturalLanguageIntent(userText, currentState = {}) {
  if (!userText || typeof userText !== 'string' || !userText.trim()) {
    return null;
  }

  const ruleResult = parsePromptSemanticRules(userText, currentState);
  if (ruleResult.matched) {
    console.info('[NLU] Deterministic rules matched:', ruleResult.debug_matches);
    return {
      source: 'rules',
      intent_id: 'deterministic_rules',
      confidence: 0.98,
      delta: ruleResult.intent_delta || {},
      constraint_patch: ruleResult.constraint_patch || null,
      dimension_patch: null,
      zone_patches: Array.isArray(ruleResult.zone_patches) ? ruleResult.zone_patches : [],
      explanation: ruleResult.explanation.join('；')
    };
  }

  try {
    const localResult = await Promise.race([
      matchSemanticIntent(userText, (progressInfo) => {
        if (progressInfo.status === 'progress') {
          console.log(`[Transformers] Downloading ${progressInfo.file}: ${progressInfo.progress.toFixed(1)}%`);
        }
      }),
      new Promise((resolve) => {
        setTimeout(() => resolve('__timeout__'), LOCAL_NLU_TIMEOUT_MS);
      })
    ]);

    if (localResult === '__timeout__') {
      console.info(`[NLU] Local HF matcher timed out after ${LOCAL_NLU_TIMEOUT_MS}ms, falling back to parser-only flow`);
      return null;
    }

    if (localResult) {
      console.info('[NLU] HF Embedding matched:', localResult.intent_id, `(${localResult.confidence.toFixed(2)})`);
      return {
        source: 'local',
        intent_id: localResult.intent_id,
        confidence: localResult.confidence,
        delta: localResult.delta || {},
        constraint_patch: null,
        dimension_patch: null,
        zone_patches: [],
        explanation: localResult.explanation || ''
      };
    }
  } catch (err) {
    console.warn('[NLU] Local HF Embedding matching failed:', err);
  }

  console.info('[NLU] No match found for:', userText);
  return null;
}
