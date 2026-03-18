import { apiClient } from '../../../app/api/api-client.js';

export const allocationApi = {
  loadAssignmentData() {
    return apiClient.get('/api/assignment-data');
  },

  loadGroups() {
    return apiClient.get('/api/v2/groups/');
  },

  saveAssignments(assignments) {
    return apiClient.post('/api/assignments', assignments);
  }
};
