import { apiClient } from '../../../app/api/api-client.js';

export const sequenceApi = {
  loadAssignmentContext() {
    return apiClient.get('/api/assignment-data');
  },

  saveSequence(payload) {
    return apiClient.post('/api/sequence/save', payload);
  },

  executePacking() {
    return apiClient.post('/api/sequence/execute', {});
  }
};
