import { createEmptyPlanningIntent } from '../domain/planning-intent.js';
import { planningV2Storage } from '../infrastructure/planning-v2-storage.js';

let sessionHistory = [];

function toPercent(value) {
  return Math.round((Number(value) || 0) * 100);
}

function selectCandidateResult(result, candidateId) {
  const selectedCandidate = result?.candidates?.find((candidate) => candidate.id === candidateId)
    || result?.candidates?.[0]
    || null;

  return {
    ...result,
    selected_candidate_id: selectedCandidate?.id || null,
    selected_candidate: selectedCandidate
  };
}

function snapshotCandidate(result, reason = 'generated') {
  const candidate = result?.selected_candidate;
  if (!candidate) {
    return null;
  }

  return {
    id: `${candidate.id}_${Date.now()}`,
    candidate_id: candidate.id,
    label: candidate.label,
    total_score: candidate.scorecard?.total_score || 0,
    storage_ratio: toPercent(candidate.layout_plan?.metrics?.storageUtilization),
    accessibility_ratio: toPercent(candidate.layout_plan?.metrics?.accessibilityRatio),
    dead_corner_ratio: toPercent(candidate.layout_plan?.metrics?.deadCornerRatio),
    average_pick_distance_mm: Math.round(candidate.layout_plan?.metrics?.averagePickDistanceMm || 0),
    zone_count: candidate.layout_plan?.zones?.length || 0,
    generated_at: new Date().toISOString(),
    reason
  };
}

export const planningV2SessionRepository = {
  loadInitialState() {
    const history = planningV2Storage.loadHistory();
    sessionHistory = Array.isArray(history) ? history : sessionHistory;
    return {
      draft: planningV2Storage.loadDraft() || createEmptyPlanningIntent(),
      latestResult: planningV2Storage.loadLatestResult(),
      history: sessionHistory
    };
  },

  saveDraft(draft) {
    planningV2Storage.saveDraft(draft);
    planningV2Storage.saveLatestResult(null);
    return draft;
  },

  loadLatestResult() {
    return planningV2Storage.loadLatestResult();
  },

  saveLatestResult(result) {
    planningV2Storage.saveLatestResult(result);
    return result;
  },

  loadHistory() {
    const history = planningV2Storage.loadHistory();
    sessionHistory = Array.isArray(history) ? history : sessionHistory;
    return sessionHistory;
  },

  appendHistory(result, reason, delta = null) {
    const baseHistory = this.loadHistory();
    const snapshot = snapshotCandidate(result, reason);
    if (!snapshot) {
      return Array.isArray(baseHistory) ? baseHistory : [];
    }

    const nextHistory = [
      { ...snapshot, delta },
      ...(Array.isArray(baseHistory) ? baseHistory : [])
    ].slice(0, 12);

    sessionHistory = nextHistory;
    planningV2Storage.saveHistory(nextHistory);
    return nextHistory;
  },

  selectCandidate(result, candidateId) {
    const selected = selectCandidateResult(result, candidateId);
    selected.history = this.loadHistory();
    planningV2Storage.saveLatestResult(selected);
    return selected;
  },

  buildCurrentNluState(lastParsedIntent = null) {
    const latestResult = this.loadLatestResult();
    const selected = latestResult?.selected_candidate;
    return {
      intent: lastParsedIntent || latestResult?.planning_intent || null,
      containerConfig: selected?.container_config || null,
      zones: selected?.layout_plan?.zones || []
    };
  },

  selectCandidateResult
};
