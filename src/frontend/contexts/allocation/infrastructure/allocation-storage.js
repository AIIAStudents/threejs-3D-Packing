import { storageAdapter } from '../../../app/storage/storage-adapter.js';

export const allocationStorage = {
  loadConstraintZones() {
    return storageAdapter.getJSON('constraintZones', []);
  },

  loadSpacePolicies() {
    return storageAdapter.getJSON('spacePolicies', {});
  },

  loadRegionsWithSubdivisions() {
    return storageAdapter.getJSON('usableRegionsWithSubdivisions');
  },

  loadUsableRegions() {
    return storageAdapter.getJSON('usableRegions');
  },

  loadGeneratedZones() {
    return storageAdapter.getJSON('generatedZones');
  },

  loadZoneAssignments() {
    return storageAdapter.getJSON('zoneAssignments', {});
  },

  saveSpacePolicies(spacePolicies) {
    return storageAdapter.setJSON('spacePolicies', spacePolicies);
  },

  saveZoneAssignments(assignments) {
    return storageAdapter.setJSON('zoneAssignments', assignments);
  }
};
