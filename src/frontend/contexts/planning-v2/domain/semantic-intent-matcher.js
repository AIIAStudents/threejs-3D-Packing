import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

const MODEL_ID = 'Xenova/bge-small-zh-v1.5';

const INTENT_CATALOG = [
  {
    id: 'narrower_aisles',
    description: '主走道窄一些，讓儲位更密一點',
    delta: {
      planning_preferences: {
        objective: { storage_density: 0.52, picking_efficiency: 0.3, safety_margin: 0.18 },
        preferred_layout_style: 'high_density'
      }
    },
    explanation: '走道縮緊，讓配置更偏容量。'
  },
  {
    id: 'wider_aisles',
    description: '走道寬一些，保留更多安全與通行餘裕',
    delta: {
      planning_preferences: {
        objective: { storage_density: 0.3, picking_efficiency: 0.28, safety_margin: 0.42 },
        preferred_layout_style: 'conservative'
      }
    },
    explanation: '走道放寬，讓配置更偏安全。'
  },
  {
    id: 'more_storage',
    description: '我想放更多儲位，提高容量',
    delta: {
      planning_preferences: {
        objective: { storage_density: 0.58, picking_efficiency: 0.24, safety_margin: 0.18 },
        preferred_layout_style: 'high_density'
      }
    },
    explanation: '提高儲位密度，優先容量。'
  },
  {
    id: 'less_storage',
    description: '少一點儲位也可以，動線更順比較重要',
    delta: {
      planning_preferences: {
        objective: { storage_density: 0.28, picking_efficiency: 0.42, safety_margin: 0.3 },
        preferred_layout_style: 'high_efficiency'
      }
    },
    explanation: '降低儲位密度，換取更好的動線。'
  },
  {
    id: 'near_entry_shipping',
    description: '熱門貨靠近入口，出貨與揀貨更快',
    delta: {
      planning_preferences: {
        keep_fast_moving_near_entry: true,
        objective: { storage_density: 0.24, picking_efficiency: 0.56, safety_margin: 0.2 },
        preferred_layout_style: 'high_efficiency'
      }
    },
    explanation: '把入口附近當成高頻優先區。'
  },
  {
    id: 'more_safety',
    description: '安全優先，保留更多緩衝與安全帶',
    delta: {
      planning_preferences: {
        objective: { storage_density: 0.25, picking_efficiency: 0.25, safety_margin: 0.5 },
        preferred_layout_style: 'conservative'
      }
    },
    explanation: '提高安全權重與緩衝比例。'
  },
  {
    id: 'less_safety',
    description: '可以更緊湊一點，把安全餘裕壓低',
    delta: {
      planning_preferences: {
        objective: { storage_density: 0.5, picking_efficiency: 0.35, safety_margin: 0.15 },
        preferred_layout_style: 'high_density'
      }
    },
    explanation: '降低安全餘裕，讓版型更緊湊。'
  },
  {
    id: 'forklift_mode',
    description: '主要使用叉車搬運',
    delta: {
      operation_profile: { handling_mode: 'forklift', turning_space_required: true }
    },
    explanation: '放大通道並預留轉向需求。'
  },
  {
    id: 'pallet_jack_mode',
    description: '主要使用拖板車搬運',
    delta: {
      operation_profile: { handling_mode: 'pallet_jack' }
    },
    explanation: '配置會偏向拖板車的走道尺度。'
  },
  {
    id: 'efficiency_priority',
    description: '希望效率更高、移動距離更短',
    delta: {
      planning_preferences: {
        objective: { storage_density: 0.25, picking_efficiency: 0.55, safety_margin: 0.2 },
        preferred_layout_style: 'high_efficiency'
      }
    },
    explanation: '以動線與揀貨效率為優先。'
  },
  {
    id: 'cold_storage',
    description: '需要冷藏或冷凍區',
    delta: {
      storage_profile: { special_zones: ['cold_storage'] }
    },
    explanation: '加入冷藏類型需求。'
  },
  {
    id: 'reserve_expansion',
    description: '希望保留未來擴充空間',
    delta: {
      planning_preferences: { reserve_expansion_area: true }
    },
    explanation: '預留後續擴充區域。'
  },
  {
    id: 'pallet_storage',
    description: '以棧板儲放為主',
    delta: {
      storage_profile: { goods_type: 'pallet', rack_mode: 'pallet_rack' },
      operation_profile: { handling_mode: 'forklift' }
    },
    explanation: '切換為棧板與貨架型配置。'
  },
  {
    id: 'carton_storage',
    description: '以紙箱與箱件儲放為主',
    delta: {
      storage_profile: { goods_type: 'carton', rack_mode: 'shelf' }
    },
    explanation: '切換為層架型配置。'
  }
];

let extractorPromise = null;
let intentEmbeddingsCache = null;

async function getExtractor(onProgress) {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID, {
      quantized: true,
      progress_callback: onProgress
    });
  }
  return extractorPromise;
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i += 1) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getVectorForText(extractor, text) {
  const output = await extractor(text, { pooling: 'cls', normalize: true });
  return Array.from(output.data);
}

async function prepareIntentEmbeddings(extractor) {
  if (intentEmbeddingsCache) {
    return intentEmbeddingsCache;
  }

  intentEmbeddingsCache = await Promise.all(
    INTENT_CATALOG.map(async (intent) => ({
      id: intent.id,
      vector: await getVectorForText(extractor, intent.description)
    }))
  );
  return intentEmbeddingsCache;
}

export async function matchSemanticIntent(text, onProgress) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null;
  }

  try {
    const extractor = await getExtractor(onProgress);
    const inputVector = await getVectorForText(extractor, text);
    const intentEmbeddings = await prepareIntentEmbeddings(extractor);

    let bestMatchId = null;
    let bestScore = -1;

    for (const item of intentEmbeddings) {
      const score = cosineSimilarity(inputVector, item.vector);
      if (score > bestScore) {
        bestScore = score;
        bestMatchId = item.id;
      }
    }

    if (bestScore < 0.6 || !bestMatchId) {
      return null;
    }

    const match = INTENT_CATALOG.find((intent) => intent.id === bestMatchId);
    if (!match) {
      return null;
    }

    return {
      intent_id: match.id,
      confidence: bestScore,
      delta: match.delta,
      explanation: match.explanation
    };
  } catch (error) {
    console.error('[HF Matcher] Transformers.js matching failed:', error);
    return null;
  }
}
