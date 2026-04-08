export function buildPlanningExplanation({ planningIntent, scorecard, assumptions = [], layoutPlan }) {
  const objective = planningIntent?.planning_preferences?.objective || {};
  const handlingMode = planningIntent?.operation_profile?.handling_mode || 'manual';
  const safetyZones = planningIntent?.warehouse?.safety_zones || [];
  const storageType = planningIntent?.storage_profile?.goods_type || 'carton';
  const reasons = [];
  const suggestions = [];

  reasons.push(
    handlingMode === 'forklift' || handlingMode === 'mixed'
      ? '因為你需要堆高機或混合搬運，主走道會保留較寬的操作空間，避免補貨與出貨互相干擾。'
      : '因為以人工或輕型搬運為主，系統把更多面積留給儲位，同時保留基本通行寬度。'
  );

  reasons.push(
    storageType === 'pallet'
      ? '主要貨型偏棧板，因此儲位帶會偏向較大的模組，讓後續接上 pallet rack 或 bulk 區更自然。'
      : storageType === 'mixed'
        ? '貨型混合時，系統會採取平衡分區，避免單一區塊只適合其中一種貨型。'
        : '紙箱與箱件比例較高時，系統會把揀貨接近性與可讀性列為重點。'
  );

  if (safetyZones.length > 0) {
    reasons.push('你要求保留逃生或消防限制，因此規劃結果會主動留下安全緩衝與邊界巡檢動線。');
  }

  if ((objective.picking_efficiency || 0) > (objective.storage_density || 0)) {
    reasons.push('這版方案偏向動線效率，會優先把高頻活動集中在入口與主走道附近。');
  } else if ((objective.storage_density || 0) > (objective.picking_efficiency || 0)) {
    reasons.push('這版方案偏向儲位密度，會把可用面積盡量轉成儲位帶，再保留必要安全與補貨動線。');
  } else {
    reasons.push('這版方案採平衡策略，在儲位密度、補貨可達性與安全留白之間取折衷。');
  }

  suggestions.push('如果你想要更多儲位，可以套用高密度方案，系統會縮減次走道並提高可用儲位比例。');
  suggestions.push('如果你更重視撿貨與出貨速度，可以切換高效率方案，讓主走道與入口鄰近區更清楚。');
  suggestions.push('若柱位或禁放區還沒標座標，補上後系統會重新避開死角與不可達區。');

  if (planningIntent?.planning_preferences?.keep_fast_moving_near_entry) {
    suggestions.push('你已選擇熱門貨靠近入口，後續可再指定哪一側是主要出貨口，讓熱區定位更準。');
  }

  if (planningIntent?.planning_preferences?.reserve_expansion_area) {
    suggestions.push('若想保留未來擴充區，可以在微調時提高保守方案權重，保留更多彈性帶。');
  }

  return {
    summary: [
      `系統目前把你的空間理解成一個以 ${handlingMode} 為主、貨型偏 ${storageType} 的倉儲配置問題。`,
      `本次方案總分 ${scorecard?.total_score || 0} 分，重點放在${(objective.storage_density || 0) >= (objective.picking_efficiency || 0) ? '容量與區域完整性' : '動線與靠近入口的補貨效率'}。`
    ],
    reasons,
    assumptions: assumptions.map((entry) => {
      if (entry.rule === 'use_default') {
        return `系統暫時以 ${JSON.stringify(entry.value)} 作為 ${entry.path} 的預設值。`;
      }
      return `${entry.path} 由需求敘述推得：${JSON.stringify(entry.value)}。`;
    }),
    suggestions,
    layout_summary: {
      generated_zones: layoutPlan?.zones?.length || 0,
      best_candidate_score: scorecard?.total_score || 0
    }
  };
}
