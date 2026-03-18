import {
  filterPackingItems,
  summarizePackingResult
} from './packing-result-policy.js';
import {
  buildDimensionText as buildSharedDimensionText,
  buildExecutionStatusViewState as buildSharedExecutionStatusViewState,
  buildPagedCollectionState as buildSharedPagedCollectionState,
  buildSelectOptions as buildSharedSelectOptions,
  normalizeArray as normalizeSharedArray
} from './packing-view-state.js';

function isPackedItem(item = {}) {
  return item.packed !== false && (
    item.packed === true ||
    item.is_packed === true ||
    item.x !== undefined ||
    item.position?.x !== undefined
  );
}

function toDimensionText(item = {}) {
  return buildSharedDimensionText(item);
}

export function buildSpaceOptions(data = {}) {
  const spaces = normalizeSharedArray(data.spaces);
  return buildSharedSelectOptions(spaces, (space) => {
    const packedCount = Number(space.packed_count) || 0;
    const unpackedCount = Number(space.unpacked_count) || 0;
    return {
      value: space.zone_id,
      label: `${space.zone_label} (${packedCount}/${packedCount + unpackedCount})`
    };
  }, 'No spaces available');
}

export function buildMetricsModel(result = {}) {
  const summary = summarizePackingResult(result);
  const status = buildSharedExecutionStatusViewState(summary.success);
  return {
    jobId: result.job_id || 'N/A',
    executionTimeText: summary.executionTimeMs ? `${summary.executionTimeMs.toFixed(2)} ms` : 'N/A',
    isSuccess: status.isSuccess,
    statusIcon: status.iconText,
    statusLabel: status.labelText,
    statusColor: status.color
  };
}

export function buildItemListModel(result = {}, filters = {}, visibleItemCount = 50) {
  const items = normalizeSharedArray(result.items);
  const filteredItems = filterPackingItems(items, filters);
  const page = buildSharedPagedCollectionState(filteredItems, visibleItemCount);
  const visibleItems = page.items.map((item, index) => ({
    key: item.item_id || item.id || `item-${index}`,
    idText: item.item_id || item.id || 'N/A',
    isPacked: isPackedItem(item),
    dimensionText: toDimensionText(item)
  }));

  return {
    isEmpty: page.isEmpty,
    visibleItems,
    totalCount: page.totalCount,
    hasMore: page.hasMore,
    remainingCount: page.remainingCount
  };
}

export function buildViewFinalState({
  data = null,
  fullData = null,
  packingResult = null,
  searchQuery = '',
  filterType = 'all',
  visibleItemCount = 50
} = {}) {
  const result = packingResult || {};
  return {
    data,
    fullData,
    packingResult: result,
    metrics: buildMetricsModel(result),
    summary: summarizePackingResult(result),
    itemList: buildItemListModel(result, { searchQuery, filterType }, visibleItemCount),
    spaceOptions: buildSpaceOptions(data || fullData || {})
  };
}
