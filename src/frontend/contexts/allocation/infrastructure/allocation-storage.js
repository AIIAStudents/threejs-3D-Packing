import { storageAdapter } from '../../../app/storage/storage-adapter.js';

export const allocationStorage = {
  loadRegionsWithSubdivisions() {
    return storageAdapter.getJSON('usableRegionsWithSubdivisions');
  },

  loadUsableRegions() {
    return storageAdapter.getJSON('usableRegions');
  },

  loadGeneratedZones() {
    return storageAdapter.getJSON('generatedZones');
  },

  saveZoneAssignments(assignments) {
    return storageAdapter.setJSON('zoneAssignments', assignments);
  }
};
