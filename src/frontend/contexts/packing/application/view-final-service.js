import {
  buildLatestPackingProjection,
  buildSpacePackingProjection,
  buildViewerPackingData,
  filterPackingItems,
  summarizePackingResult
} from '../domain/packing-result-policy.js';
import { buildViewFinalState } from '../domain/view-final-projection.js';
import { packingResultsApi } from '../infrastructure/packing-results-api.js';

export const viewFinalService = {
  async loadLatestPackingResult() {
    const data = await packingResultsApi.loadLatestResult();
    const projection = buildLatestPackingProjection(data);
    return {
      data,
      ...projection
    };
  },

  async loadSpacePackingResult(spaceId) {
    const data = await packingResultsApi.loadSpaceResult(spaceId);
    return buildSpacePackingProjection(data);
  },

  async loadLatestViewState(filters = {}) {
    const { data, fullData, packingResult } = await this.loadLatestPackingResult();
    return buildViewFinalState({
      data,
      fullData,
      packingResult,
      ...filters
    });
  },

  async loadSpaceViewState(spaceId, context = {}) {
    const packingResult = await this.loadSpacePackingResult(spaceId);
    return buildViewFinalState({
      data: context.fullData,
      fullData: context.fullData,
      packingResult,
      searchQuery: context.searchQuery,
      filterType: context.filterType,
      visibleItemCount: context.visibleItemCount
    });
  },

  buildViewState(args) {
    return buildViewFinalState(args);
  },

  summarizeResult(result) {
    return summarizePackingResult(result);
  },

  buildViewerData(packingResult, fullData, resolveColor) {
    return buildViewerPackingData(packingResult, fullData, resolveColor);
  },

  filterItems(items, filters) {
    return filterPackingItems(items, filters);
  },

  executePacking() {
    return packingResultsApi.executePacking();
  }
};
