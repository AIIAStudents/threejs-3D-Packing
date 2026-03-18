export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function buildSelectOptions(items = [], mapItem, emptyLabel = 'No options available') {
  const normalizedItems = normalizeArray(items);
  if (normalizedItems.length === 0) {
    return [{
      value: '',
      label: emptyLabel,
      selected: true
    }];
  }

  return normalizedItems.map((item, index) => ({
    ...mapItem(item, index),
    selected: index === 0
  }));
}

export function buildDimensionText(item = {}, { fallback = 'N/A', separator = ' x ' } = {}) {
  const dimensions = [item.length, item.width, item.height]
    .map((value) => value ?? fallback);
  return dimensions.join(separator);
}

export function buildProgressViewState({ current = 0, total = 0, fractionDigits = 0 } = {}) {
  const normalizedCurrent = Number(current) || 0;
  const normalizedTotal = Number(total) || 0;
  const progressPercent = normalizedTotal > 0
    ? (normalizedCurrent / normalizedTotal) * 100
    : 0;

  return {
    current: normalizedCurrent,
    total: normalizedTotal,
    progressPercent,
    progressText: `${progressPercent.toFixed(fractionDigits)}%`,
    stepText: `${normalizedCurrent} / ${normalizedTotal}`
  };
}

export function buildExecutionStatusViewState(success) {
  const isSuccess = success !== false;
  return {
    isSuccess,
    iconText: isSuccess ? 'OK' : '!!',
    labelText: isSuccess ? 'Success' : 'Failed',
    color: isSuccess ? '#4CAF50' : '#f44336'
  };
}

export function buildPagedCollectionState(items = [], visibleItemCount = 50) {
  const normalizedItems = normalizeArray(items);
  return {
    items: normalizedItems.slice(0, visibleItemCount),
    totalCount: normalizedItems.length,
    hasMore: normalizedItems.length > visibleItemCount,
    remainingCount: Math.max(normalizedItems.length - visibleItemCount, 0),
    isEmpty: normalizedItems.length === 0
  };
}
