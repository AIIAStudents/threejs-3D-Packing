import { buildBulkCreateItemsDraft, buildItemUpdateDraft } from '../domain/item-drafts.js';
import { itemsApi } from '../infrastructure/items-api.js';

export const inventoryItemManagementService = {
  loadItems() {
    return itemsApi.list();
  },

  createItems({ baseName, quantity, itemData }) {
    return itemsApi.createBulk(
      buildBulkCreateItemsDraft({ baseName, quantity, itemData })
    );
  },

  updateItem(currentItem, dimensions) {
    if (!currentItem) {
      throw new Error('Current item is required');
    }

    return itemsApi.update(
      currentItem.id,
      buildItemUpdateDraft(currentItem, dimensions)
    );
  },

  deleteItem(itemId) {
    return itemsApi.remove(itemId);
  }
};
