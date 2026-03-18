import { apiClient } from '../../../app/api/api-client.js';

export const packingResultsApi = {
  loadLatestResult() {
    return apiClient.get('/api/sequence/latest-result');
  },

  loadSpaceResult(spaceId) {
    return apiClient.get(`/api/sequence/space-result/${spaceId}`);
  },

  executePacking() {
    return apiClient.post('/api/sequence/execute', {});
  }
};
