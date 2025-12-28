/*
    File: view_final.js  
    Description: Logic for the packing result preview page
*/

import { ThreeViewer } from './three_viewer.js';

export const ViewFinalPage = {
  API_BASE: 'http://127.0.0.1:8888/api',

  state: {
    packingResult: null,
    filteredItems: [],
    searchQuery: '',
    filterType: 'all'
  },

  elements: {},

  async init() {
    console.log('ViewFinalPage init');

    // Bind DOM elements
    this.bindElements();

    // Event listeners
    this.setupEventListeners();

    // Load packing result
    await this.loadPackingResult();
  },

  bindElements() {
    this.elements = {
      // Header buttons
      backBtn: document.getElementById('back-btn'),
      repackBtn: document.getElementById('repack-btn'),
      exportBtn: document.getElementById('export-btn'),

      // Metrics
      jobId: document.getElementById('job-id'),
      execTime: document.getElementById('exec-time'),
      statusIcon: document.getElementById('status-icon'),
      statusText: document.getElementById('status-text'),

      // Statistics - match HTML IDs
      statPacked: document.getElementById('packed-count'),
      statUnpacked: document.getElementById('unpacked-count'),
      statTotal: document.getElementById('total-count'),
      statUtilization: document.getElementById('utilization'),
      progressPercent: document.getElementById('progress-percent'),
      progressFill: document.getElementById('progress-fill'),

      // Item list
      searchInput: document.getElementById('search-input'),
      filterSelect: document.getElementById('filter-select'),
      itemList: document.getElementById('item-list'),

      // 3D Preview
      fullscreenBtn: document.getElementById('fullscreen-btn')
    };
  },

  setupEventListeners() {
    this.elements.backBtn?.addEventListener('click', () => this.handleBack());
    this.elements.repackBtn?.addEventListener('click', () => this.handleRepack());
    this.elements.exportBtn?.addEventListener('click', () => this.handleExport());

    this.elements.searchInput?.addEventListener('input', (e) => this.handleSearch(e.target.value));
    this.elements.filterSelect?.addEventListener('change', (e) => this.handleFilter(e.target.value));

    if (this.elements.fullscreenBtn) {
      this.elements.fullscreenBtn.addEventListener('click', () => this.handleFullscreen());
    }
  },

  async loadPackingResult() {
    try {
      console.log('Loading packing result...');
      const response = await fetch(`${this.API_BASE}/sequence/latest-result`);

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Packing result loaded:', data);

      // Handle zone-based results
      if (data.spaces && Array.isArray(data.spaces) && data.spaces.length > 0) {
        // Use first space/zone for now
        const firstSpace = data.spaces[0];
        this.state.packingResult = {
          job_id: data.job_id,
          success: true,
          packed_count: data.total_packed || 0,
          unpacked_count: data.total_unpacked || 0,
          volume_utilization: firstSpace.result?.volume_utilization || 0,
          execution_time_ms: data.total_execution_time || 0,
          zone_label: firstSpace.zone_label,
          items: firstSpace.result?.items || []
        };
      } else {
        // Fallback for single result format
        this.state.packingResult = data;
      }

      console.log('Rendering with result:', this.state.packingResult);
      this.renderAll();
    } catch (error) {
      console.error('Failed to load packing result:', error);
      this.showError('無法載入打包結果。請確認是否已執行打包。');
    }
  },

  renderAll() {
    if (!this.state.packingResult) return;

    this.renderMetrics();
    this.renderStatistics();
    this.renderItemList();
  },

  renderMetrics() {
    const res = this.state.packingResult;

    if (this.elements.jobId) {
      this.elements.jobId.textContent = res.job_id || 'N/A';
    }

    if (this.elements.execTime) {
      const time = res.execution_time_ms;
      this.elements.execTime.textContent = time ? `${time.toFixed(2)} ms` : 'N/A';
    }

    // Status
    if (res.success) {
      if (this.elements.statusIcon) this.elements.statusIcon.textContent = '✅';
      if (this.elements.statusText) {
        this.elements.statusText.textContent = '成功';
        this.elements.statusText.style.color = '#4CAF50';
      }
    } else {
      if (this.elements.statusIcon) this.elements.statusIcon.textContent = '❌';
      if (this.elements.statusText) {
        this.elements.statusText.textContent = '失敗';
        this.elements.statusText.style.color = '#f44336';
      }
    }
  },

  renderStatistics() {
    const res = this.state.packingResult;
    if (!res) {
      console.warn('No packing result to render');
      return;
    }

    const packed = res.packed_count || 0;
    const unpacked = res.unpacked_count || 0;
    const total = packed + unpacked;
    const utilization = (res.volume_utilization || 0) * 100;

    // Safely set text content with null checks
    if (this.elements.statPacked) this.elements.statPacked.textContent = packed;
    if (this.elements.statUnpacked) this.elements.statUnpacked.textContent = unpacked;
    if (this.elements.statTotal) this.elements.statTotal.textContent = total;
    if (this.elements.statUtilization) this.elements.statUtilization.textContent = `${utilization.toFixed(2)}%`;

    // Progress Bar
    const percent = total > 0 ? (packed / total) * 100 : 0;
    if (this.elements.progressPercent) this.elements.progressPercent.textContent = `${percent.toFixed(1)}%`;
    if (this.elements.progressFill) this.elements.progressFill.style.width = `${percent}%`;
  },

  renderItemList() {
    if (!this.elements.itemList) return;

    this.elements.itemList.innerHTML = '';

    const items = this.state.packingResult?.items || [];
    const filtered = this.filterItems(items);

    if (filtered.length === 0) {
      this.elements.itemList.innerHTML = '<div class="item-list-placeholder"><p>無物件資料</p></div>';
      return;
    }

    filtered.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = `item-card ${item.packed ? 'item-packed' : 'item-unpacked'}`;
      itemEl.innerHTML = `
        <div class="item-header">
          <span class="item-id">${item.item_id || 'N/A'}</span>
          <span class="item-status">${item.packed ? '✓ 已打包' : '✗ 未打包'}</span>
        </div>
        <div class="item-details">
          <span>尺寸: ${item.length} × ${item.width} × ${item.height}</span>
        </div>
      `;
      this.elements.itemList.appendChild(itemEl);
    });
  },

  filterItems(items) {
    let filtered = items;

    // Filter by type
    if (this.state.filterType === 'packed') {
      filtered = filtered.filter(item => item.packed);
    } else if (this.state.filterType === 'unpacked') {
      filtered = filtered.filter(item => !item.packed);
    }

    // Filter by search query
    if (this.state.searchQuery) {
      const query = this.state.searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        (item.item_id || '').toLowerCase().includes(query)
      );
    }

    return filtered;
  },

  handleSearch(query) {
    this.state.searchQuery = query;
    this.renderItemList();
  },

  handleFilter(type) {
    this.state.filterType = type;
    this.renderItemList();
  },

  handleBack() {
    window.location.hash = '/src/html/assign_sequence.html';
  },

  async handleRepack() {
    try {
      const response = await fetch(`${this.API_BASE}/sequence/execute`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('打包失敗');
      }

      alert('✓ 重新打包成功！');
      await this.loadPackingResult();
    } catch (error) {
      console.error('Repack error:', error);
      alert('❌ 重新打包失敗：' + error.message);
    }
  },

  handleExport() {
    alert('匯出功能即將推出');
  },

  handleFullscreen() {
    // Fullscreen logic here
    alert('全螢幕功能即將推出');
  },

  showError(message) {
    if (this.elements.itemList) {
      this.elements.itemList.innerHTML = `
        <div class="error-message">
          <p>❌ ${message}</p>
        </div>
      `;
    }
  }
};
