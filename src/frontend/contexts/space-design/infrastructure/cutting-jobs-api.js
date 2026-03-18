import { apiClient } from '../../../app/api/api-client.js';

export const cuttingJobsApi = {
  create(payload) {
    return apiClient.post('/api/v2/cutting/jobs', payload);
  }
};
