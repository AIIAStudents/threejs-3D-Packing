function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function toPercent(value) {
  return Math.round(clamp(value) * 100);
}

function buildMetricScore(label, score, explanation) {
  return {
    label,
    score,
    explanation
  };
}

export function buildPlanningScorecard(layoutPlan = {}, intent = {}) {
  const metrics = layoutPlan.metrics || {};
  const evaluation = layoutPlan.evaluation || {};
  const components = evaluation.components || {};
  const reserveBonus = intent?.planning_preferences?.reserve_expansion_area ? 8 : 0;
  const safetyZones = intent?.warehouse?.safety_zones?.length || 0;

  const storageCapacity = toPercent(metrics.storageUtilization);
  const flowEfficiency = toPercent(components.pickingEfficiency);
  const safetyMargin = Math.round((toPercent(components.accessibility) * 0.6) + ((safetyZones > 0 ? 90 : 72) * 0.4));
  const accessibility = toPercent(metrics.accessibilityRatio);
  const deadCornerControl = 100 - toPercent(metrics.deadCornerRatio / 0.12);
  const expansionFlexibility = Math.min(
    100,
    Math.round((toPercent(components.slottingFlexibility) * 0.7) + reserveBonus)
  );

  return {
    total_score: Math.max(0, Math.min(100, Math.round(evaluation.score || 0))),
    breakdown: [
      buildMetricScore('儲位容量分數', storageCapacity, `可用儲位約占總面積 ${toPercent(metrics.storageUtilization)}%，反映容量密度。`),
      buildMetricScore('動線效率分數', flowEfficiency, `平均揀貨距離約 ${Math.round(metrics.averagePickDistanceMm || 0)} mm，主走道與副走道配置較接近高效率方案。`),
      buildMetricScore('安全保留分數', safetyMargin, `${safetyZones > 0 ? '已保留逃生或消防緩衝' : '未明確提供安全帶座標，因此採用基準緩衝'}，避免把容量壓到極限。`),
      buildMetricScore('可達性分數', accessibility, `可接近儲位比例約 ${toPercent(metrics.accessibilityRatio)}%，代表進出與補貨可達程度。`),
      buildMetricScore('死角控制分數', deadCornerControl, `死角比例約 ${toPercent(metrics.deadCornerRatio / 0.12)}%，分數越高表示難以到達的區域越少。`),
      buildMetricScore('擴充彈性分數', expansionFlexibility, intent?.planning_preferences?.reserve_expansion_area
        ? '已納入預留擴充區的偏好，方案保留較高的後續調整空間。'
        : '目前以當前容量與效率為主，擴充空間屬於中等彈性。')
    ]
  };
}
