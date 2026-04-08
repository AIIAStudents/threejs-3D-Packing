import { normalizePlanningIntent } from './planning-intent.js';

function toPercent(value) {
  return Math.round((Number(value) || 0) * 100);
}

export function normalizeRefineCommand(command) {
  const raw = String(command || '').trim();
  const normalized = raw.toLowerCase();
  const aliasMap = new Map([
    ['走道寬一點', 'wider_aisles'],
    ['主走道寬一些', 'wider_aisles'],
    ['wider_aisles', 'wider_aisles'],
    ['主走道窄一些', 'narrower_aisles'],
    ['走道窄一點', 'narrower_aisles'],
    ['narrower_aisles', 'narrower_aisles'],
    ['多一點儲位', 'more_storage'],
    ['增加儲位', 'more_storage'],
    ['more_storage', 'more_storage'],
    ['熱門貨靠近入口', 'near_entry_shipping'],
    ['出貨區靠入口', 'near_entry_shipping'],
    ['near_entry_shipping', 'near_entry_shipping']
  ]);

  return aliasMap.get(raw) || aliasMap.get(normalized) || normalized;
}

export function applyRefineCommand(intent, command) {
  const nextIntent = normalizePlanningIntent(intent);
  const normalizedCommand = normalizeRefineCommand(command);

  if (normalizedCommand === 'wider_aisles') {
    nextIntent.planning_preferences.objective = {
      storage_density: 0.28,
      picking_efficiency: 0.32,
      safety_margin: 0.4
    };
    nextIntent.planning_preferences.preferred_layout_style = 'conservative';
  } else if (normalizedCommand === 'narrower_aisles') {
    nextIntent.planning_preferences.objective = {
      storage_density: 0.54,
      picking_efficiency: 0.28,
      safety_margin: 0.18
    };
    nextIntent.planning_preferences.preferred_layout_style = 'high_density';
  } else if (normalizedCommand === 'more_storage') {
    nextIntent.planning_preferences.objective = {
      storage_density: 0.58,
      picking_efficiency: 0.24,
      safety_margin: 0.18
    };
    nextIntent.planning_preferences.preferred_layout_style = 'high_density';
  } else if (normalizedCommand === 'near_entry_shipping') {
    nextIntent.planning_preferences.keep_fast_moving_near_entry = true;
    nextIntent.planning_preferences.objective = {
      storage_density: 0.24,
      picking_efficiency: 0.56,
      safety_margin: 0.2
    };
    nextIntent.planning_preferences.preferred_layout_style = 'high_efficiency';
  }

  return nextIntent;
}

export function buildDeltaExplanation(previousResult, nextResult, command = '') {
  const beforeCandidate = previousResult?.selected_candidate;
  const afterCandidate = nextResult?.selected_candidate;
  const beforeSnapshot = beforeCandidate ? {
    candidate_id: beforeCandidate.id,
    total_score: beforeCandidate.scorecard?.total_score || 0,
    storage_ratio: toPercent(beforeCandidate.layout_plan?.metrics?.storageUtilization),
    accessibility_ratio: toPercent(beforeCandidate.layout_plan?.metrics?.accessibilityRatio),
    dead_corner_ratio: toPercent(beforeCandidate.layout_plan?.metrics?.deadCornerRatio),
    average_pick_distance_mm: Math.round(beforeCandidate.layout_plan?.metrics?.averagePickDistanceMm || 0)
  } : previousResult;
  const afterSnapshot = afterCandidate ? {
    candidate_id: afterCandidate.id,
    total_score: afterCandidate.scorecard?.total_score || 0,
    storage_ratio: toPercent(afterCandidate.layout_plan?.metrics?.storageUtilization),
    accessibility_ratio: toPercent(afterCandidate.layout_plan?.metrics?.accessibilityRatio),
    dead_corner_ratio: toPercent(afterCandidate.layout_plan?.metrics?.deadCornerRatio),
    average_pick_distance_mm: Math.round(afterCandidate.layout_plan?.metrics?.averagePickDistanceMm || 0)
  } : null;

  if (!beforeSnapshot || !afterSnapshot) {
    return {
      command,
      summary: ['這次微調已套用，但沒有足夠的前後方案資料可比較。']
    };
  }

  const scoreDelta = (afterSnapshot.total_score || 0) - (beforeSnapshot.total_score || 0);
  const storageDelta = (afterSnapshot.storage_ratio || 0) - (beforeSnapshot.storage_ratio || 0);
  const accessibilityDelta = (afterSnapshot.accessibility_ratio || 0) - (beforeSnapshot.accessibility_ratio || 0);
  const deadCornerDelta = (afterSnapshot.dead_corner_ratio || 0) - (beforeSnapshot.dead_corner_ratio || 0);
  const pickDistanceDelta = Math.round((afterSnapshot.average_pick_distance_mm || 0) - (beforeSnapshot.average_pick_distance_mm || 0));

  const summary = [];
  if (scoreDelta !== 0) summary.push(`總分${scoreDelta > 0 ? '提升' : '下降'} ${Math.abs(scoreDelta)} 分`);
  if (storageDelta !== 0) summary.push(`儲位率${storageDelta > 0 ? '提升' : '下降'} ${Math.abs(storageDelta)}%`);
  if (accessibilityDelta !== 0) summary.push(`可達性${accessibilityDelta > 0 ? '提升' : '下降'} ${Math.abs(accessibilityDelta)}%`);
  if (deadCornerDelta !== 0) summary.push(`死角比例${deadCornerDelta > 0 ? '增加' : '降低'} ${Math.abs(deadCornerDelta)}%`);
  if (pickDistanceDelta !== 0) summary.push(`平均揀貨距離${pickDistanceDelta > 0 ? '增加' : '縮短'} ${Math.abs(pickDistanceDelta)} mm`);
  if (!summary.length) summary.push('微調已套用，整體指標變化不大。');

  return {
    command,
    previous_candidate_id: beforeSnapshot.candidate_id,
    next_candidate_id: afterSnapshot.candidate_id,
    summary,
    metrics: {
      score_delta: scoreDelta,
      storage_delta: storageDelta,
      accessibility_delta: accessibilityDelta,
      dead_corner_delta: deadCornerDelta,
      pick_distance_delta_mm: pickDistanceDelta
    }
  };
}
