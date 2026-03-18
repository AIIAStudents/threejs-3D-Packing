function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildBulkCreateItemsDraft({ baseName, quantity, itemData }) {
  const total = toInteger(quantity, 1);
  const items = [];

  for (let index = 0; index < total; index += 1) {
    const itemId = total === 1 ? baseName : `${baseName}_${index + 1}`;
    items.push({
      item_id: itemId,
      group_id: toInteger(itemData.group_id),
      length: toNumber(itemData.length),
      width: toNumber(itemData.width),
      height: toNumber(itemData.height)
    });
  }

  return { items };
}

export function buildItemUpdateDraft(currentItem, dimensions) {
  return {
    group_id: currentItem.group_id,
    note: currentItem.note || '',
    length: toNumber(dimensions.length),
    width: toNumber(dimensions.width),
    height: toNumber(dimensions.height)
  };
}
