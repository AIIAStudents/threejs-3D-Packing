import { apiClient } from '../../../app/api/api-client.js';

export const itemsApi = {
  list() {
    return apiClient.get('/api/v2/items/');
  },

  createBulk(payload) {
    return apiClient.post('/api/v2/items/bulk', payload);
  },

  update(itemId, payload) {
    return apiClient.put(`/api/v2/items/${itemId}`, payload);
  },

  remove(itemId) {
    return apiClient.delete(`/api/v2/items/${itemId}`);
  }
};
