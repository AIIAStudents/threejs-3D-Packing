import { storageAdapter } from '../../../app/storage/storage-adapter.js';

const STORAGE_KEYS = {
  containerConfig: 'containerConfig',
  constraintZones: 'constraintZones',
  generatedZones: 'generatedZones',
  layoutPlan: 'layoutPlan',
  spaceConstraints: 'spaceConstraints',
  usableRegions: 'usableRegions',
  usableRegionsWithSubdivisions: 'usableRegionsWithSubdivisions'
};

export const spaceDesignStorage = {
  loadContainerConfig() {
    return storageAdapter.getJSON(STORAGE_KEYS.containerConfig, null);
  },

  loadGeneratedZones() {
    return storageAdapter.getJSON(STORAGE_KEYS.generatedZones, []);
  },

  loadSpaceConstraints() {
    return storageAdapter.getJSON(STORAGE_KEYS.spaceConstraints, null);
  },

  clearGeneratedZones() {
    return storageAdapter.removeItem(STORAGE_KEYS.generatedZones);
  },

  saveLayoutPlan(layoutPlan) {
    return storageAdapter.setJSON(STORAGE_KEYS.layoutPlan, layoutPlan);
  },

  saveSpaceConstraints(constraints) {
    return storageAdapter.setJSON(STORAGE_KEYS.spaceConstraints, constraints);
  },

  saveGeneratedZones(zones) {
    return storageAdapter.setJSON(STORAGE_KEYS.generatedZones, zones);
  },

  saveUsableRegionsWithSubdivisions(regions) {
    return storageAdapter.setJSON(STORAGE_KEYS.usableRegionsWithSubdivisions, regions);
  },

  saveUsableRegions(regions) {
    return storageAdapter.setJSON(STORAGE_KEYS.usableRegions, regions);
  },

  saveConstraintZones(zones) {
    return storageAdapter.setJSON(STORAGE_KEYS.constraintZones, zones);
  }
};
