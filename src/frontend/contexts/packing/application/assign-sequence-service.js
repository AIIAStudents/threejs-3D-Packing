import {
  buildSequencePayload,
  buildZoneOptions,
  normalizeAssignmentContext,
  buildZoneSequence
} from '../domain/sequence-policy.js';
import {
  buildSequenceViewState,
  buildZoneSelectorState
} from '../domain/sequence-view-projection.js';
import { sequenceApi } from '../infrastructure/sequence-api.js';

export const assignSequenceService = {
  async loadData() {
    const data = await sequenceApi.loadAssignmentContext();
    return normalizeAssignmentContext(data);
  },

  buildZoneOptions(zones) {
    return buildZoneOptions(zones);
  },

  buildZoneSelectorState(zones) {
    return buildZoneSelectorState(zones);
  },

  getZoneSequence(zoneId, context) {
    return buildZoneSequence(zoneId, context);
  },

  buildSequenceViewState(zoneId, context, resolveGroupColor) {
    return buildSequenceViewState(zoneId, context, resolveGroupColor);
  },

  saveItemOrder(updates) {
    return sequenceApi.saveSequence(buildSequencePayload(updates));
  },

  executePacking() {
    return sequenceApi.executePacking();
  }
};
