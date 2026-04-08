function normalizePrompt(prompt = '') {
  return String(prompt || '')
    .replace(/[，、；。]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function detectSide(text = '') {
  if (/(?:\u53f3\u5074|\u53f3\u908a|\u53f3\u65b9)/.test(text)) return 'east';
  if (/(?:\u5de6\u5074|\u5de6\u908a|\u5de6\u65b9)/.test(text)) return 'west';
  if (/(?:\u4e0a\u65b9|\u4e0a\u5074|\u5317\u5074|\u524d\u5074)/.test(text)) return 'north';
  if (/(?:\u4e0b\u65b9|\u4e0b\u5074|\u5357\u5074|\u5f8c\u5074)/.test(text)) return 'south';
  if (/(?:\u5165\u53e3|\u51fa\u5165\u53e3|\u9760\u9580)/.test(text)) return 'entry';
  return null;
}

function createEmptyRuleResult(prompt) {
  return {
    matched: false,
    normalized_prompt: normalizePrompt(prompt),
    explanation: [],
    debug_matches: [],
    intent_delta: {
      planning_preferences: {
        semantic_directives: {}
      }
    },
    constraint_patch: {
      planning: {},
      building: {}
    },
    zone_patches: []
  };
}

function ensureSemanticDirectives(result) {
  result.intent_delta.planning_preferences ??= {};
  result.intent_delta.planning_preferences.semantic_directives ??= {};
  return result.intent_delta.planning_preferences.semantic_directives;
}

function addMatch(result, label, detail) {
  result.matched = true;
  result.debug_matches.push({ label, detail });
  result.explanation.push(detail);
}

export function parsePromptSemanticRules(prompt = '', currentState = {}) {
  const text = normalizePrompt(prompt);
  const result = createEmptyRuleResult(prompt);
  if (!text) {
    return result;
  }

  const semanticDirectives = ensureSemanticDirectives(result);
  const currentZoneCount = Array.isArray(currentState?.zones)
    ? currentState.zones.filter((zone) => zone?.type === 'usable').length
    : 0;

  if (hasAny(text, [
    /\u4e3b\u8d70\u9053.*(?:\u7a84|\u5c0f|\u7e2e|\u6536\u7a84|\u7a84\u4e00\u9ede)/,
    /(?:\u7a84|\u5c0f|\u7e2e|\u6536\u7a84|\u7a84\u4e00\u9ede).*\u4e3b\u8d70\u9053/,
    /main aisle.*(?:narrow|smaller)/i
  ])) {
    semanticDirectives.main_aisle_mode = 'narrow';
    result.constraint_patch.planning.primaryAisleWidth = 1800;
    result.constraint_patch.planning.secondaryAisleWidth = 1200;
    result.constraint_patch.planning.targetStorageBand = 3200;
    addMatch(result, 'main_aisle_mode', '\u4e3b\u8d70\u9053\u8abf\u7a84\uff0c\u589e\u52a0\u5132\u4f4d\u53ef\u7528\u5e36\u5bec\u3002');
  }

  if (hasAny(text, [
    /\u4e3b\u8d70\u9053.*(?:\u5bec|\u653e\u5bec|\u5927\u4e00\u9ede)/,
    /(?:\u5bec|\u653e\u5bec|\u5927\u4e00\u9ede).*\u4e3b\u8d70\u9053/,
    /main aisle.*(?:wide|wider)/i
  ])) {
    semanticDirectives.main_aisle_mode = 'wide';
    result.constraint_patch.planning.primaryAisleWidth = 2800;
    result.constraint_patch.planning.secondaryAisleWidth = 1600;
    addMatch(result, 'main_aisle_mode', '\u4e3b\u8d70\u9053\u653e\u5bec\uff0c\u63d0\u5347\u4e3b\u901a\u9053\u4f5c\u696d\u9918\u88d5\u3002');
  }

  if (hasAny(text, [
    /(?:\u71b1\u9580\u8ca8|\u9ad8\u983b\u8ca8|\u5feb\u53d6\u8ca8|\u5feb\u901f\u51fa\u8ca8\u54c1).*(?:\u5165\u53e3|\u51fa\u5165\u53e3|\u9760\u9580)/,
    /(?:\u5165\u53e3|\u51fa\u5165\u53e3|\u9760\u9580).*(?:\u71b1\u9580\u8ca8|\u9ad8\u983b\u8ca8|\u5feb\u53d6\u8ca8|\u5feb\u901f\u51fa\u8ca8\u54c1)/,
    /fast moving.*entry/i
  ])) {
    semanticDirectives.fast_moving_zone = true;
    result.intent_delta.planning_preferences.keep_fast_moving_near_entry = true;
    result.intent_delta.planning_preferences.preferred_layout_style = 'high_efficiency';
    result.intent_delta.planning_preferences.zoning_strategy = 'fast_moving';
    result.constraint_patch.planning.strategy = 'picking_first';
    result.constraint_patch.planning.targetStorageBand = 1800;
    result.zone_patches.push({
      kind: 'fast_moving_zone',
      side: 'entry',
      width_ratio: 0.24,
      depth_ratio: 0.18,
      label: '\u9ad8\u983b\u5132\u4f4d\u5340'
    });
    addMatch(result, 'fast_moving_zone', '\u5165\u53e3\u9644\u8fd1\u512a\u5148\u6a19\u793a\u9ad8\u983b\u5132\u4f4d\u5340\uff0c\u5f37\u5316\u71b1\u9580\u8ca8\u9760\u5165\u53e3\u3002');
  }

  if (hasAny(text, [
    /(?:\u4fdd\u7559|\u9810\u7559).*(?:\u51fa\u8ca8|\u51fa\u8ca8\u66ab\u5b58|\u51fa\u8ca8\u7de9\u885d|\u7de9\u885d\u5340)/,
    /(?:\u51fa\u8ca8|\u51fa\u8ca8\u66ab\u5b58|\u51fa\u8ca8\u7de9\u885d|\u7de9\u885d\u5340).*(?:\u4fdd\u7559|\u9810\u7559)/,
    /shipping buffer/i
  ])) {
    const bufferSide = detectSide(text) || 'entry';
    semanticDirectives.shipping_buffer_side = bufferSide;
    result.intent_delta.planning_preferences.reserve_expansion_area = true;
    result.intent_delta.operation_profile = {
      loading_area_required: true
    };
    result.constraint_patch.planning.preserveBoundaryInspectionAisle = true;
    result.zone_patches.push({
      kind: 'shipping_buffer',
      side: bufferSide,
      width_ratio: 0.18,
      depth_ratio: 0.22,
      label: '\u51fa\u8ca8\u7de9\u885d\u5340'
    });
    addMatch(
      result,
      'shipping_buffer',
      `\u5728${bufferSide === 'entry' ? '\u5165\u53e3\u5074' : bufferSide}\u4fdd\u7559\u51fa\u8ca8\u7de9\u885d\u5340\u3002`
    );
  }

  const enlargeMatch = text.match(/\u5132\u4f4d\u5340\s*0?(\d+).*(?:\u52a0\u5927|\u653e\u5927|\u64f4\u5927|\u5927\u4e00\u9ede|\u52a0\u5bec)/);
  if (enlargeMatch) {
    const zoneIndex = Number(enlargeMatch[1]) || 1;
    semanticDirectives.enlarge_storage_zone_index = zoneIndex;
    result.constraint_patch.planning.targetStorageBand = Math.max(
      Number(result.constraint_patch.planning.targetStorageBand) || 0,
      3400
    );
    result.zone_patches.push({
      kind: 'enlarge_storage_zone',
      zone_index: zoneIndex,
      scale: currentZoneCount > 8 ? 1.12 : 1.2
    });
    addMatch(result, 'enlarge_storage_zone', `\u5c07\u5132\u4f4d\u5340 ${String(zoneIndex).padStart(2, '0')} \u653e\u5927\u3002`);
  }

  return result;
}
