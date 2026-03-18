import { buildAnimationPackingData } from '../domain/packing-result-policy.js';
import {
  buildAnimationPreviewState,
  buildSeekPreviewState
} from '../domain/animation-preview-projection.js';
import { packingResultsApi } from '../infrastructure/packing-results-api.js';

export const animationPreviewService = {
  async loadAnimationPackingData() {
    const data = await packingResultsApi.loadLatestResult();
    return buildAnimationPackingData(data);
  },

  async loadPreviewState() {
    const packingData = await this.loadAnimationPackingData();
    return {
      packingData,
      previewState: buildAnimationPreviewState({ packingData })
    };
  },

  buildPreviewState(args) {
    return buildAnimationPreviewState(args);
  },

  buildSeekState(percent, totalSteps) {
    return buildSeekPreviewState(percent, totalSteps);
  }
};
