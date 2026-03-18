import { apiClient } from '../../../app/api/api-client.js';

export const groupsApi = {
  list() {
    return apiClient.get('/api/v2/groups/');
  },

  create(payload) {
    return apiClient.post('/api/v2/groups/', payload);
  },

  update(groupId, payload) {
    return apiClient.put(`/api/v2/groups/${groupId}`, payload);
  },

  remove(groupId) {
    return apiClient.delete(`/api/v2/groups/${groupId}`);
  }
};
