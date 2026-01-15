
/*
    File: view_final.js  
    Description: Logic for the packing result preview page
    Last Updated: Consistent Group Coloring & UI Fixes
*/

import { ThreeViewer } from './three_viewer.js';
import { ColorManager } from '../utils/color_manager.js';
import { buildInChunks } from '../utils/performance.js';

export const ViewFinalPage = {
  API_BASE: 'http://127.0.0.1:8888/api',

  state: {
    packingResult: null,
    filteredItems: [],
    searchQuery: '',
    filterType: 'all',
    visibleItemCount: 50 // New: Lazy loading limit
  },

  elements: {},

  async init() {
    console.log('ViewFinalPage init');

    // Bind DOM elements
    this.bindElements();

    // Initialize Three.js viewer
    this.initThreeViewer();

    // Event listeners
    this.setupEventListeners();

    // Load packing result
    await this.loadPackingResult();
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
      this.threeViewer.init();  // Must call init() to set up scene
      console.log('✓ ThreeViewer initialized');
    } catch (error) {
      console.error('Failed to initialize ThreeViewer:', error);
      this.showPreviewError('無法初始化3D場景');
    }
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

    // Display toggle buttons
    document.getElementById('toggle-container-btn')?.addEventListener('click', (e) => {
      this.toggleDisplay('container', e.currentTarget);
    });

    document.getElementById('toggle-zones-btn')?.addEventListener('click', (e) => {
      this.toggleDisplay('zones', e.currentTarget);
    });

    document.getElementById('toggle-items-btn')?.addEventListener('click', (e) => {
      this.toggleDisplay('items', e.currentTarget);
    });
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

      // DEBUG: Container configuration tracing
      console.log('━━━━━━━━━━━ CONTAINER DEBUG ━━━━━━━━━━━');
      console.log('[ViewFinal] API Response - data.container:', data.container);
      console.log('[ViewFinal] Container shape from API:', data.container?.shape);
      console.log('[ViewFinal] Container keys:', data.container ? Object.keys(data.container) : 'null');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Store full data for later use
      this.state.fullData = data;

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
          // CRITICAL FIX: Use master container (data.container) if available to show full context
          container: data.container || firstSpace.result?.container || {},
          zones: data.zones || [],
          items: firstSpace.result?.items || []
        };
      } else {
        // Fallback for single result format
        this.state.packingResult = data;
      }

      console.log('Rendering with result:', this.state.packingResult);
      // DEBUG: Final container check before rendering
      console.log('[ViewFinal] Final packingResult.container:', this.state.packingResult.container);
      console.log('[ViewFinal] Final container.shape:', this.state.packingResult.container?.shape);
      this.renderAll();
      this.populateSpaceSelector(data);
    } catch (error) {
      console.error('Failed to load packing result:', error);
      this.showError('無法載入打包結果。請確認是否已執行打包。');
    }
  },

  populateSpaceSelector(data) {
    const spaceSelect = document.getElementById('space-select');
    if (!spaceSelect) return;

    // Clear existing options
    spaceSelect.innerHTML = '';

    if (data.spaces && Array.isArray(data.spaces) && data.spaces.length > 0) {
      // Add options for each space
      data.spaces.forEach((space, index) => {
        const option = document.createElement('option');
        option.value = space.zone_id;
        option.textContent = `${space.zone_label} (${space.packed_count}/${space.packed_count + space.unpacked_count} 件)`;
        if (index === 0) option.selected = true;
        spaceSelect.appendChild(option);
      });
    } else {
      // No spaces available
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '無可用空間';
      spaceSelect.appendChild(option);
    }
  },

  renderAll() {
    if (!this.state.packingResult) return;

    this.renderMetrics();
    this.renderStatistics();
    this.renderItemList();
    this.render3DPreview();
  },


  async render3DPreview() {
    if (!this.threeViewer) {
      console.warn('ThreeViewer not initialized');
      this.showPreviewError('3D渲染器未初始化');
      return;
    }

    const result = this.state.packingResult;
    if (!result) {
      console.warn('No packing result data');
      return;
    }

    try {
      // 1. Prepare Zones Map (ID -> Offset)
      const zoneOffsetMap = {};
      const zones = result.zones || this.state.fullData?.zones || [];

      zones.forEach(zone => {
        zoneOffsetMap[zone.zone_id] = {
          x: zone.x || 0,
          y: zone.y || 0
        };
      });

      // 2. Prepare Items with World Coordinates (Chunked)
      let allItems = [];
      const spaces = this.state.fullData?.spaces || [];

      // Flatten all items first (lightweight)
      let rawItems = [];
      spaces.forEach(space => {
        if (space.result && space.result.items) {
          const zoneOffset = zoneOffsetMap[space.zone_id] || { x: 0, y: 0 };
          // Attach zone offset to raw item container for processing
          space.result.items.forEach(item => {
            rawItems.push({ item, zoneOffset });
          });
        }
      });

      // Process items in chunks to avoid UI freeze
      // This maps raw data to viewer format and assigns colors
      await buildInChunks(rawItems, 500, (chunk) => {
        const processedChunk = chunk.map(({ item, zoneOffset }) => {
          const newItem = { ...item, zoneOffset };
          // Apply Color
          newItem.color = ColorManager.getGroupColor(newItem.group_id);
          return newItem;
        });
        allItems.push(...processedChunk);
      });

      const packingData = {
        container: result.container || this.state.fullData?.container || {},
        items: allItems,
        zones: zones
      };

      console.log('[ViewFinal] Rendering 3D preview with:', {
        containerSize: packingData.container,
        itemCount: packingData.items.length,
        zoneCount: packingData.zones.length
      });

      // Yield before heavy GPU upload
      setTimeout(() => {
        this.threeViewer.loadPackingResult(packingData);
        console.log('✓ 3D preview rendered successfully');
      }, 10);

    } catch (error) {
      console.error('Render error:', error);
      this.showPreviewError(`渲染失敗: ${error.message}`);
    }
  },

  showPreviewError(message) {
    const container = document.getElementById('preview-container');
    if (container) {
      container.innerHTML = `
        <div class="preview-placeholder">
          <div class="placeholder-icon">⚠️</div>
          <p>${message}</p>
        </div>
      `;
    }
  },

  toggleDisplay(type, button) {
    if (!this.threeViewer) {
      console.warn('ThreeViewer not initialized');
      return;
    }

    // Toggle button active state
    const isActive = button.classList.toggle('active');

    // Call corresponding ThreeViewer toggle method
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

    console.log(`✓ Toggled ${type} visibility: ${isActive}`);
  },

  async onSpaceChange(spaceId) {
    if (!spaceId) return;

    console.log('Switching to space:', spaceId);

    try {
      // Fetch space-specific packing result
      const response = await fetch(`${this.API_BASE}/sequence/space-result/${spaceId}`);

      if (!response.ok) {
        throw new Error('Failed to load space result');
      }

      const spaceData = await response.json();

      // Update state with space-specific result
      this.state.packingResult = {
        zone_id: spaceData.zone_id,
        zone_label: spaceData.zone_label,
        packed_count: spaceData.packed_count || 0,
        unpacked_count: spaceData.unpacked_count || 0,
        volume_utilization: spaceData.volume_utilization || 0,
        execution_time_ms: spaceData.execution_time_ms || 0,
        container: spaceData.result?.container || {},
        items: spaceData.result?.items || [],
        zones: spaceData.result?.zones || []
      };

      // Reset visible items count on new data
      this.state.visibleItemCount = 50;

      // Re-render everything with new space data
      this.renderAll();

      console.log(`✓ Switched to space: ${spaceData.zone_label}`);

    } catch (error) {
      console.error('Failed to switch space:', error);
      alert('載入空間數據失敗：' + error.message);
    }
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

    // --- LAZY LOADING OPTIMIZATION ---
    // Only render the visible subset of items
    const visibleItems = filtered.slice(0, this.state.visibleItemCount);

    visibleItems.forEach(item => {
      // Fix: Check multiple possible packed status properties
      const isPacked = item.packed !== false && (item.packed === true || item.is_packed === true || item.x !== undefined);

      const itemEl = document.createElement('div');
      itemEl.className = `item-card ${isPacked ? 'item-packed' : 'item-unpacked'}`;
      itemEl.innerHTML = `
        <div class="item-header">
          <span class="item-id">${item.item_id || item.id || 'N/A'}</span>
          <span class="item-status">${isPacked ? '✓ 已打包' : '✗ 未打包'}</span>
        </div>
        <div class="item-details">
          <span>尺寸: ${item.length || 'N/A'} × ${item.width || 'N/A'} × ${item.height || 'N/A'}</span>
        </div>
      `;
      this.elements.itemList.appendChild(itemEl);
    });

    // Add "Load More" button if there are more items
    if (filtered.length > this.state.visibleItemCount) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'btn btn-secondary btn-block mt-2';
      loadMoreBtn.textContent = `載入更多 (${filtered.length - this.state.visibleItemCount} 剩餘)`;
      loadMoreBtn.style.width = '100%';
      loadMoreBtn.onclick = () => this.handleLoadMore();
      this.elements.itemList.appendChild(loadMoreBtn);
    }
  },

  handleLoadMore() {
    this.state.visibleItemCount += 50;
    this.renderItemList();
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
    this.state.visibleItemCount = 50; // Reset
    this.renderItemList();
  },

  handleFilter(type) {
    this.state.filterType = type;
    this.state.visibleItemCount = 50; // Reset
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
