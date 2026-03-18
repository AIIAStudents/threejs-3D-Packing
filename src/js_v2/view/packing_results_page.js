/*
    File: packing_results_page.js
    Description: Logic for the packing results page
*/

import { ThreeViewer } from './three_viewer.js';
import { ColorManager } from '../utils/color_manager.js';
import { viewFinalService } from '../../frontend/contexts/packing/application/view-final-service.js';

export const PackingResultsPage = {
  state: {
    packingResult: null,
    fullData: null,
    searchQuery: '',
    filterType: 'all',
    visibleItemCount: 50,
    viewState: null
  },

  elements: {},

  async init() {
    this.bindElements();
    this.initThreeViewer();
    this.setupEventListeners();
    await this.loadPackingResult();
  },

  bindElements() {
    this.elements = {
      backBtn: document.getElementById('back-btn'),
      repackBtn: document.getElementById('repack-btn'),
      exportBtn: document.getElementById('export-btn'),
      jobId: document.getElementById('job-id'),
      execTime: document.getElementById('exec-time'),
      statusIcon: document.getElementById('status-icon'),
      statusText: document.getElementById('status-text'),
      statPacked: document.getElementById('packed-count'),
      statUnpacked: document.getElementById('unpacked-count'),
      statTotal: document.getElementById('total-count'),
      statUtilization: document.getElementById('utilization'),
      progressPercent: document.getElementById('progress-percent'),
      progressFill: document.getElementById('progress-fill'),
      spaceSelect: document.getElementById('space-select'),
      searchInput: document.getElementById('search-input'),
      filterSelect: document.getElementById('filter-select'),
      itemList: document.getElementById('item-list'),
      fullscreenBtn: document.getElementById('fullscreen-btn')
    };
  },

  initThreeViewer() {
    const container = document.getElementById('preview-container');
    if (!container) {
      console.error('Preview container not found');
      return;
    }

    try {
      if (this.threeViewer) {
        this.threeViewer.dispose();
      }
      this.threeViewer = new ThreeViewer(container);
      this.threeViewer.init();
    } catch (error) {
      console.error('Failed to initialize ThreeViewer:', error);
      this.showPreviewError('Failed to initialize 3D preview.');
    }
  },

  setupEventListeners() {
    this.elements.backBtn?.addEventListener('click', () => this.handleBack());
    this.elements.repackBtn?.addEventListener('click', () => this.handleRepack());
    this.elements.exportBtn?.addEventListener('click', () => this.handleExport());
    this.elements.searchInput?.addEventListener('input', (event) => this.handleSearch(event.target.value));
    this.elements.filterSelect?.addEventListener('change', (event) => this.handleFilter(event.target.value));
    this.elements.spaceSelect?.addEventListener('change', (event) => this.onSpaceChange(event.target.value));
    this.elements.fullscreenBtn?.addEventListener('click', () => this.handleFullscreen());

    document.getElementById('toggle-container-btn')?.addEventListener('click', (event) => {
      this.toggleDisplay('container', event.currentTarget);
    });
    document.getElementById('toggle-zones-btn')?.addEventListener('click', (event) => {
      this.toggleDisplay('zones', event.currentTarget);
    });
    document.getElementById('toggle-items-btn')?.addEventListener('click', (event) => {
      this.toggleDisplay('items', event.currentTarget);
    });
  },

  getFilterState() {
    return {
      searchQuery: this.state.searchQuery,
      filterType: this.state.filterType,
      visibleItemCount: this.state.visibleItemCount
    };
  },

  applyViewState(viewState) {
    this.state.viewState = viewState;
    this.state.fullData = viewState.fullData;
    this.state.packingResult = viewState.packingResult;
  },

  refreshViewState() {
    if (!this.state.packingResult) {
      return;
    }

    this.applyViewState(viewFinalService.buildViewState({
      data: this.state.fullData,
      fullData: this.state.fullData,
      packingResult: this.state.packingResult,
      ...this.getFilterState()
    }));
  },

  async loadPackingResult() {
    try {
      const viewState = await viewFinalService.loadLatestViewState(this.getFilterState());
      this.applyViewState(viewState);
      this.renderAll();
    } catch (error) {
      console.error('Failed to load packing result:', error);
      this.showError(`Failed to load packing result: ${error.message}`);
    }
  },

  async onSpaceChange(spaceId) {
    if (!spaceId) {
      return;
    }

    try {
      this.state.visibleItemCount = 50;
      const viewState = await viewFinalService.loadSpaceViewState(spaceId, {
        fullData: this.state.fullData,
        ...this.getFilterState()
      });
      this.applyViewState(viewState);
      this.renderAll();
    } catch (error) {
      console.error('Failed to switch space:', error);
      alert(`Failed to switch space: ${error.message}`);
    }
  },

  renderAll() {
    if (!this.state.packingResult) {
      return;
    }

    this.renderSpaceSelector();
    this.renderMetrics();
    this.renderStatistics();
    this.renderItemList();
    this.render3DPreview();
  },

  renderSpaceSelector() {
    const select = this.elements.spaceSelect;
    if (!select) {
      return;
    }

    const selectedValue = this.state.packingResult?.zone_id;
    const options = this.state.viewState?.spaceOptions || [];

    select.innerHTML = '';

    options.forEach((spaceOption) => {
      const option = document.createElement('option');
      option.value = spaceOption.value;
      option.textContent = spaceOption.label;
      option.selected = selectedValue !== undefined && selectedValue !== null
        ? String(spaceOption.value) === String(selectedValue)
        : Boolean(spaceOption.selected);
      select.appendChild(option);
    });
  },

  renderMetrics() {
    const metrics = this.state.viewState?.metrics;
    if (!metrics) {
      return;
    }

    if (this.elements.jobId) {
      this.elements.jobId.textContent = metrics.jobId;
    }

    if (this.elements.execTime) {
      this.elements.execTime.textContent = metrics.executionTimeText;
    }

    if (metrics.isSuccess) {
      if (this.elements.statusIcon) {
        this.elements.statusIcon.textContent = metrics.statusIcon;
      }
      if (this.elements.statusText) {
        this.elements.statusText.textContent = metrics.statusLabel;
        this.elements.statusText.style.color = metrics.statusColor;
      }
    } else {
      if (this.elements.statusIcon) {
        this.elements.statusIcon.textContent = metrics.statusIcon;
      }
      if (this.elements.statusText) {
        this.elements.statusText.textContent = metrics.statusLabel;
        this.elements.statusText.style.color = metrics.statusColor;
      }
    }
  },

  renderStatistics() {
    const summary = this.state.viewState?.summary;
    if (!summary) {
      return;
    }

    if (this.elements.statPacked) {
      this.elements.statPacked.textContent = summary.packedCount;
    }
    if (this.elements.statUnpacked) {
      this.elements.statUnpacked.textContent = summary.unpackedCount;
    }
    if (this.elements.statTotal) {
      this.elements.statTotal.textContent = summary.totalCount;
    }
    if (this.elements.statUtilization) {
      this.elements.statUtilization.textContent = `${summary.utilizationPercent.toFixed(2)}%`;
    }
    if (this.elements.progressPercent) {
      this.elements.progressPercent.textContent = `${summary.progressPercent.toFixed(1)}%`;
    }
    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${summary.progressPercent}%`;
    }
  },

  renderItemList() {
    if (!this.elements.itemList) {
      return;
    }

    this.elements.itemList.innerHTML = '';

    const itemList = this.state.viewState?.itemList;
    if (!itemList || itemList.isEmpty) {
      this.elements.itemList.innerHTML = '<div class="item-list-placeholder"><p>No items to display.</p></div>';
      return;
    }

    itemList.visibleItems.forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = `item-card ${item.isPacked ? 'item-packed' : 'item-unpacked'}`;
      itemEl.innerHTML = `
        <div class="item-header">
          <span class="item-id">${item.idText}</span>
          <span class="item-status">${item.isPacked ? 'Packed' : 'Unpacked'}</span>
        </div>
        <div class="item-details">
          <span>Dimensions: ${item.dimensionText}</span>
        </div>
      `;
      this.elements.itemList.appendChild(itemEl);
    });

    if (itemList.hasMore) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'btn btn-secondary btn-block mt-2';
      loadMoreBtn.textContent = `Load more (${itemList.remainingCount} remaining)`;
      loadMoreBtn.style.width = '100%';
      loadMoreBtn.onclick = () => this.handleLoadMore();
      this.elements.itemList.appendChild(loadMoreBtn);
    }
  },

  async render3DPreview() {
    if (!this.threeViewer) {
      this.showPreviewError('3D preview is not available.');
      return;
    }

    const result = this.state.packingResult;
    if (!result) {
      return;
    }

    try {
      const packingData = viewFinalService.buildViewerData(
        result,
        this.state.fullData,
        (groupId) => ColorManager.getGroupColor(groupId)
      );

      setTimeout(() => {
        this.threeViewer.loadPackingResult(packingData);
      }, 10);
    } catch (error) {
      console.error('Render error:', error);
      this.showPreviewError(`Preview render failed: ${error.message}`);
    }
  },

  showPreviewError(message) {
    const container = document.getElementById('preview-container');
    if (!container) {
      return;
    }

    container.innerHTML = `
      <div class="preview-placeholder">
        <div class="placeholder-icon">3D</div>
        <p>${message}</p>
      </div>
    `;
  },

  toggleDisplay(type, button) {
    if (!this.threeViewer) {
      return;
    }

    const isActive = button.classList.toggle('active');
    switch (type) {
      case 'container':
        this.threeViewer.toggleContainer(isActive);
        break;
      case 'zones':
        this.threeViewer.toggleZones(isActive);
        break;
      case 'items':
        this.threeViewer.toggleItems(isActive);
        break;
    }
  },

  handleLoadMore() {
    this.state.visibleItemCount += 50;
    this.refreshViewState();
    this.renderItemList();
  },

  handleSearch(query) {
    this.state.searchQuery = query;
    this.state.visibleItemCount = 50;
    this.refreshViewState();
    this.renderItemList();
  },

  handleFilter(type) {
    this.state.filterType = type;
    this.state.visibleItemCount = 50;
    this.refreshViewState();
    this.renderItemList();
  },

  handleBack() {
    window.location.hash = '/assign-sequence';
  },

  async handleRepack() {
    try {
      await viewFinalService.executePacking();
      alert('Packing executed successfully.');
      await this.loadPackingResult();
    } catch (error) {
      console.error('Repack error:', error);
      alert(`Packing execution failed: ${error.message}`);
    }
  },

  handleExport() {
    alert('Export is not implemented yet.');
  },

  handleFullscreen() {
    alert('Fullscreen is not implemented yet.');
  },

  showError(message) {
    if (!this.elements.itemList) {
      return;
    }

    this.elements.itemList.innerHTML = `
      <div class="error-message">
        <p>${message}</p>
      </div>
    `;
  }
};
