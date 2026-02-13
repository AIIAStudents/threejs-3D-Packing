// Secondary Region Editor - Allows users to subdivide usable regions
// This module handles the intermediate editing step between space planning and allocation

export const SecondaryRegionEditor = {
  state: {
    mode: 'view', // 'view' | 'editing'
    selectedRegionId: null,
    selectedRegion: null,
    subdivisions: [], // Array of split lines
    childRegions: [], // Preview of generated child regions
    originalRegions: [], // Backup for cancel

    // Canvas interaction
    isDragging: false,
    dragStartPos: null,
    currentSplitLine: null,

    // Settings
    snapToGrid: true,
    gridSize: 100, // mm
    minRegionSize: 1000, // 1m minimum dimension

    // Container reference
    containerConfig: null,
  },

  elements: {},
  isInitialized: false,

  async init() {
    console.log('[SecondaryEditor] Initializing...');
    this.bindDOM();
    this.addEventListeners();

    // Load container config
    const storedConfig = localStorage.getItem('containerConfig');
    if (storedConfig) {
      this.state.containerConfig = JSON.parse(storedConfig);
    }

    // Load usable regions
    const storedZones = localStorage.getItem('generatedZones');
    if (storedZones) {
      const zones = JSON.parse(storedZones);
      this.state.originalRegions = zones.filter(z => z.type === 'usable');

      // Calculate area for regions that don't have it
      for (const region of this.state.originalRegions) {
        if (!region.area && region.width && region.height) {
          // Calculate area in m² (width and height are in mm)
          region.area = (region.width * region.height) / 1000000;
          console.log(`[SecondaryEditor] Calculated area for ${region.id}: ${region.area.toFixed(2)} m²`);
        }
      }

      console.log('[SecondaryEditor] Loaded regions:', this.state.originalRegions.length);
    }

    this.isInitialized = true;

    // Update regions list when initialized in edit mode
    if (this.state.mode === 'editing') {
      this.updateRegionsList();
    }
  },

  bindDOM() {
    // Toolbar elements
    this.elements.toolbar = document.getElementById('subdivision-toolbar');
    this.elements.selectedInfo = document.getElementById('selected-region-info');
    this.elements.subdivisionTools = document.getElementById('subdivision-tools');
    this.elements.selectedArea = document.getElementById('selected-area');
    this.elements.selectedDimensions = document.getElementById('selected-dimensions');

    // Split mode controls
    this.elements.splitMode = document.getElementById('split-mode');
    this.elements.equalParams = document.getElementById('equal-split-params');
    this.elements.ratioParams = document.getElementById('ratio-split-params');
    this.elements.manualParams = document.getElementById('manual-split-params');

    // Equal split
    this.elements.equalDirection = document.getElementById('equal-direction');
    this.elements.equalParts = document.getElementById('equal-parts');
    this.elements.btnApplyEqual = document.getElementById('btn-apply-equal');

    // Ratio split
    this.elements.ratioDirection = document.getElementById('ratio-direction');
    this.elements.ratioPercent = document.getElementById('ratio-percent');
    this.elements.btnApplyRatio = document.getElementById('btn-apply-ratio');

    // Manual split
    this.elements.snapToGrid = document.getElementById('snap-to-grid');

    // Actions
    this.elements.btnClearSplits = document.getElementById('btn-clear-splits');
    this.elements.btnDeselect = document.getElementById('btn-deselect');
    this.elements.btnCancelEdit = document.getElementById('btn-cancel-edit');
    this.elements.btnResetSubdivisions = document.getElementById('btn-reset-subdivisions');
    this.elements.btnApplySubdivisions = document.getElementById('btn-apply-subdivisions');

    // Canvas
    this.elements.canvas = document.getElementById('planning-canvas');
    if (this.elements.canvas) {
      this.elements.ctx = this.elements.canvas.getContext('2d');
    }

    // Selected region info panel
    this.elements.selectedRegionInfo = document.getElementById('selected-region-info');
    this.elements.selectedArea = document.getElementById('selected-area');
    this.elements.selectedDimensions = document.getElementById('selected-dimensions');

    // Regions list (in right panel)
    this.elements.secondaryRegionsPanel = document.getElementById('secondary-regions-panel');
    this.elements.regionsList = document.getElementById('regions-list');
  },

  addEventListeners() {
    // Split mode change
    if (this.elements.splitMode) {
      this.elements.splitMode.addEventListener('change', (e) => {
        this.switchSplitMode(e.target.value);
      });
    }

    // Equal split
    if (this.elements.btnApplyEqual) {
      this.elements.btnApplyEqual.addEventListener('click', () => {
        this.applyEqualSplit();
      });
    }

    // Ratio split
    if (this.elements.btnApplyRatio) {
      this.elements.btnApplyRatio.addEventListener('click', () => {
        this.applyRatioSplit();
      });
    }

    // Snap to grid toggle
    if (this.elements.snapToGrid) {
      this.elements.snapToGrid.addEventListener('change', (e) => {
        this.state.snapToGrid = e.target.checked;
      });
    }

    // Clear splits
    if (this.elements.btnClearSplits) {
      this.elements.btnClearSplits.addEventListener('click', () => {
        this.clearSubdivisions();
      });
    }

    // Deselect region
    if (this.elements.btnDeselect) {
      this.elements.btnDeselect.addEventListener('click', () => {
        this.deselectRegion();
      });
    }

    // Cancel edit mode
    if (this.elements.btnCancelEdit) {
      this.elements.btnCancelEdit.addEventListener('click', () => {
        this.exitEditMode();
      });
    }

    // Reset all subdivisions
    if (this.elements.btnResetSubdivisions) {
      this.elements.btnResetSubdivisions.addEventListener('click', () => {
        this.resetAllSubdivisions();
      });
    }

    // Apply and continue
    if (this.elements.btnApplySubdivisions) {
      this.elements.btnApplySubdivisions.addEventListener('click', () => {
        this.applyAndContinue();
      });
    }

    // Canvas interaction
    if (this.elements.canvas) {
      this.elements.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
      this.elements.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
      this.elements.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      this.elements.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    }
  },

  switchSplitMode(mode) {
    // Hide all param sections
    if (this.elements.equalParams) this.elements.equalParams.style.display = 'none';
    if (this.elements.ratioParams) this.elements.ratioParams.style.display = 'none';
    if (this.elements.manualParams) this.elements.manualParams.style.display = 'none';

    // Show selected mode
    switch (mode) {
      case 'equal':
        if (this.elements.equalParams) this.elements.equalParams.style.display = 'block';
        break;
      case 'ratio':
        if (this.elements.ratioParams) this.elements.ratioParams.style.display = 'block';
        break;
      case 'manual':
        if (this.elements.manualParams) this.elements.manualParams.style.display = 'block';
        break;
    }
  },

  // ============================================================
  // SUBDIVISION OPERATIONS
  // ============================================================

  generateChildName(parentName, index) {
    // If parent is a standard root name (Region X, 區域 X), use Alphabet
    if (!parentName || parentName.startsWith('Region') || parentName.startsWith('區域')) {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      return alphabet[index] || `${index + 1}`;
    }
    // Otherwise, append number (e.g. A -> A-1, A-1 -> A-1-1)
    return `${parentName}-${index + 1}`;
  },

  getAllLeafRegions(region) {
    if (!region.has_subdivisions || !region.child_regions || region.child_regions.length === 0) {
      return [region];
    }

    let leaves = [];
    for (const child of region.child_regions) {
      leaves = leaves.concat(this.getAllLeafRegions(child));
    }
    return leaves;
  },

  applyEqualSplit() {
    if (!this.state.selectedRegion) return;

    const direction = this.elements.equalDirection?.value || 'horizontal';
    const parts = parseInt(this.elements.equalParts?.value) || 2;

    console.log(`[SecondaryEditor] Applying equal split: ${parts} parts, ${direction}`);

    const region = this.state.selectedRegion;

    // Clear existing subdivisions first to prevent stacking
    this.state.childRegions = [];

    const children = [];

    if (direction === 'horizontal') {
      // Split horizontally (along Z axis)
      const partHeight = region.height / parts;

      for (let i = 0; i < parts; i++) {
        const childY = region.y - region.height / 2 + partHeight / 2 + i * partHeight;
        const childName = this.generateChildName(region.name || region.label, i);
        children.push({
          id: `${region.id}_child_${i}`,
          parent_id: region.id,
          type: 'usable',
          name: childName,
          label: childName,
          x: region.x,
          y: childY,
          width: region.width,
          height: partHeight,
          area: (region.width * partHeight) / 1000000, // Convert to m²
          metadata: {
            subdivision_method: 'equal',
            subdivision_index: i,
            subdivision_total: parts
          }
        });
      }
    } else {
      // Split vertically (along X axis)
      const partWidth = region.width / parts;

      for (let i = 0; i < parts; i++) {
        const childX = region.x - region.width / 2 + partWidth / 2 + i * partWidth;
        const childName = this.generateChildName(region.name || region.label, i);
        children.push({
          id: `${region.id}_child_${i}`,
          parent_id: region.id,
          type: 'usable',
          name: childName,
          label: childName,
          x: childX,
          y: region.y,
          width: partWidth,
          height: region.height,
          area: (partWidth * region.height) / 1000000,
          metadata: {
            subdivision_method: 'equal',
            subdivision_index: i,
            subdivision_total: parts
          }
        });
      }
    }

    // Validate
    const validation = this.validateSubdivision(children);
    if (!validation.valid) {
      alert(`無法套用分割: ${validation.errors.join(', ')}`);
      return;
    }

    this.state.childRegions = children;
    this.updateRegionWithSubdivision(region.id, children);
    this.renderCanvas();
    this.updateRegionsList(); // Update the regions list
  },

  applyRatioSplit() {
    if (!this.state.selectedRegion) return;

    const direction = this.elements.ratioDirection?.value || 'horizontal';
    const percent = parseInt(this.elements.ratioPercent?.value) || 50;
    const ratio = percent / 100;

    console.log(`[SecondaryEditor] Applying ratio split: ${percent}%, ${direction}`);

    const region = this.state.selectedRegion;

    // Clear existing subdivisions first to prevent stacking
    this.state.childRegions = [];

    const children = [];
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    if (direction === 'horizontal') {
      // Split horizontally
      const height1 = region.height * ratio;
      const height2 = region.height * (1 - ratio);

      const name0 = this.generateChildName(region.name || region.label, 0);
      const name1 = this.generateChildName(region.name || region.label, 1);

      children.push({
        id: `${region.id}_child_0`,
        parent_id: region.id,
        type: 'usable',
        name: name0,
        label: name0,
        x: region.x,
        y: region.y - region.height / 2 + height1 / 2,
        width: region.width,
        height: height1,
        area: (region.width * height1) / 1000000,
        metadata: {
          subdivision_method: 'ratio',
          subdivision_index: 0,
          subdivision_ratio: ratio
        }
      });

      children.push({
        id: `${region.id}_child_1`,
        parent_id: region.id,
        type: 'usable',
        name: name1,
        label: name1,
        x: region.x,
        y: region.y + region.height / 2 - height2 / 2,
        width: region.width,
        height: height2,
        area: (region.width * height2) / 1000000,
        metadata: {
          subdivision_method: 'ratio',
          subdivision_index: 1,
          subdivision_ratio: 1 - ratio
        }
      });
    } else {
      // Split vertically
      const width1 = region.width * ratio;
      const width2 = region.width * (1 - ratio);

      const name0 = this.generateChildName(region.name || region.label, 0);
      const name1 = this.generateChildName(region.name || region.label, 1);

      children.push({
        id: `${region.id}_child_0`,
        parent_id: region.id,
        type: 'usable',
        name: name0,
        label: name0,
        x: region.x - region.width / 2 + width1 / 2,
        y: region.y,
        width: width1,
        height: region.height,
        area: (width1 * region.height) / 1000000,
        metadata: {
          subdivision_method: 'ratio',
          subdivision_index: 0,
          subdivision_ratio: ratio
        }
      });

      children.push({
        id: `${region.id}_child_1`,
        parent_id: region.id,
        type: 'usable',
        name: name1,
        label: name1,
        x: region.x + region.width / 2 - width2 / 2,
        y: region.y,
        width: width2,
        height: region.height,
        area: (width2 * region.height) / 1000000,
        metadata: {
          subdivision_method: 'ratio',
          subdivision_index: 1,
          subdivision_ratio: 1 - ratio
        }
      });
    }

    // Validate
    const validation = this.validateSubdivision(children);
    if (!validation.valid) {
      alert(`無法套用分割: ${validation.errors.join(', ')}`);
      return;
    }

    this.state.childRegions = children;
    this.updateRegionWithSubdivision(region.id, children);
    this.renderCanvas();
    this.updateRegionsList(); // Update the regions list
  },

  validateSubdivision(children) {
    const errors = [];

    // Check minimum size
    for (const child of children) {
      if (child.width < this.state.minRegionSize || child.height < this.state.minRegionSize) {
        errors.push(`區域尺寸過小 (最小 ${this.state.minRegionSize}mm)`);
        break;
      }
    }

    // Check area conservation (within 0.1% tolerance)
    if (this.state.selectedRegion) {
      const parentArea = this.state.selectedRegion.area;
      const childrenArea = children.reduce((sum, c) => sum + c.area, 0);
      const diff = Math.abs(parentArea - childrenArea) / parentArea;

      if (diff > 0.001) {
        errors.push(`面積不守恆 (誤差 ${(diff * 100).toFixed(2)}%)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  updateRegionWithSubdivision(regionId, children) {
    // Recursive search to find the region (top-level or nested)
    const findRegion = (regions) => {
      for (const r of regions) {
        if (r.id === regionId) return r;
        if (r.has_subdivisions && r.child_regions && r.child_regions.length > 0) {
          const found = findRegion(r.child_regions);
          if (found) return found;
        }
      }
      return null;
    };

    const region = findRegion(this.state.originalRegions);

    if (region) {
      console.log(`[SecondaryEditor] Updating subdivisions for region ${region.id}`);
      region.has_subdivisions = true;
      region.subdivision_version = (region.subdivision_version || 0) + 1;
      region.child_regions = children;

      // Also ensure selectedRegion state matches
      if (this.state.selectedRegion && this.state.selectedRegion.id === regionId) {
        this.state.childRegions = children;
      }
    } else {
      console.error(`[SecondaryEditor] Could not find region ${regionId} to update`);
    }
  },

  clearSubdivisions() {
    if (!this.state.selectedRegion) return;

    this.state.childRegions = [];
    this.state.subdivisions = [];

    const regionId = this.state.selectedRegionId;

    // Recursive search to find the region
    const findRegion = (regions) => {
      for (const r of regions) {
        if (r.id === regionId) return r;
        if (r.has_subdivisions && r.child_regions && r.child_regions.length > 0) {
          const found = findRegion(r.child_regions);
          if (found) return found;
        }
      }
      return null;
    };

    const region = findRegion(this.state.originalRegions);

    if (region) {
      console.log(`[SecondaryEditor] Clearing subdivisions for region ${region.id}`);
      region.has_subdivisions = false;
      region.child_regions = [];
    } else {
      console.error(`[SecondaryEditor] Could not find region ${regionId} to clear`);
    }

    this.renderCanvas();
    this.updateRegionsList(); // Update list to reflect changes
  },

  // ============================================================
  // CANVAS INTERACTION
  // ============================================================

  handleCanvasClick(e) {
    console.log('[SecondaryEditor] Canvas clicked, mode:', this.state.mode);

    if (this.state.mode !== 'editing') {
      console.warn('[SecondaryEditor] Not in editing mode, ignoring click');
      return;
    }

    const rect = this.elements.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    console.log('[SecondaryEditor] Click position:', { screen: { x, y } });

    // Convert to world coordinates
    const worldPos = this.screenToWorld(x, y);
    console.log('[SecondaryEditor] World position:', worldPos);

    // Check if clicking on a region
    const clickedRegion = this.findRegionAtPoint(worldPos.x, worldPos.y);

    if (clickedRegion) {
      console.log('[SecondaryEditor] Found region:', clickedRegion.id);
      this.selectRegion(clickedRegion);
    } else {
      console.log('[SecondaryEditor] No region found at click position');
      console.log('[SecondaryEditor] Available regions:', this.state.originalRegions.length);
      if (this.state.originalRegions.length > 0) {
        console.log('[SecondaryEditor] First region bounds:', {
          id: this.state.originalRegions[0].id,
          x: this.state.originalRegions[0].x,
          y: this.state.originalRegions[0].y,
          width: this.state.originalRegions[0].width,
          height: this.state.originalRegions[0].height
        });
      }
    }
  },

  handleMouseDown(e) {
    if (this.state.mode !== 'editing') return;
    if (this.elements.splitMode?.value !== 'manual') return;
    if (!this.state.selectedRegion) return;

    const rect = this.elements.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.state.isDragging = true;
    this.state.dragStartPos = { x, y };
  },

  handleMouseMove(e) {
    if (!this.state.isDragging) return;

    const rect = this.elements.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update current split line preview
    this.state.currentSplitLine = {
      start: this.state.dragStartPos,
      end: { x, y }
    };

    this.renderCanvas();
  },

  handleMouseUp(e) {
    if (!this.state.isDragging) return;

    this.state.isDragging = false;

    // TODO: Apply manual split based on currentSplitLine
    // For now, just clear the preview
    this.state.currentSplitLine = null;
    this.renderCanvas();
  },

  findRegionAtPoint(worldX, worldY) {
    // Helper to check bounds
    const isInRegion = (x, y, r) => {
      const left = r.x - r.width / 2;
      const right = r.x + r.width / 2;
      const top = r.y - r.height / 2;
      const bottom = r.y + r.height / 2;
      return x >= left && x <= right && y >= top && y <= bottom;
    };

    // 1. Check children of subdivided regions first (to allow selecting A, B, etc.)
    for (const region of this.state.originalRegions) {
      if (region.has_subdivisions && region.child_regions) {
        // Recursive check function to find deepest clicked region
        const findDeepest = (currentRegion) => {
          if (currentRegion.has_subdivisions && currentRegion.child_regions && currentRegion.child_regions.length > 0) {
            for (const child of currentRegion.child_regions) {
              const found = findDeepest(child);
              if (found) return found;
            }
          }
          if (isInRegion(worldX, worldY, currentRegion)) {
            return currentRegion;
          }
          return null;
        };

        // Check if point is in this main region tree
        if (isInRegion(worldX, worldY, region)) {
          // We are inside the main region, let's find the specific child
          for (const child of region.child_regions) {
            const hit = findDeepest(child);
            if (hit) return hit;
          }
          // If in region but no child hit (shouldn't happen if children cover parent), return parent
          return region;
        }
      }
    }

    // 2. Check original regions (top level)
    for (const region of this.state.originalRegions) {
      // Logic for selecting top level regions
      // If we are already selecting a sub-region (A), clicking elsewhere in Region 1 
      // should probably select Region 1 or sibling B?
      // For now, simple hit test.
      if (isInRegion(worldX, worldY, region)) {
        return region;
      }
    }

    return null;
  },

  selectRegion(region) {
    console.log('[SecondaryEditor] Selected region:', region.id);

    this.state.selectedRegionId = region.id;
    this.state.selectedRegion = region;
    this.state.childRegions = region.child_regions || [];

    // Update UI
    if (this.elements.selectedInfo) {
      this.elements.selectedInfo.style.display = 'block';
    }
    if (this.elements.selectedRegionInfo) {
      this.elements.selectedRegionInfo.style.display = 'block';
    }
    if (this.elements.subdivisionTools) {
      this.elements.subdivisionTools.style.display = 'block';
    }

    // Update selected region info panel with proper data
    console.log('[SecondaryEditor] Region data:', {
      area: region.area,
      width: region.width,
      height: region.height,
      bounds: region.bounds
    });

    if (this.elements.selectedArea) {
      const area = region.area || 0;
      this.elements.selectedArea.textContent = area.toFixed(2);
      console.log('[SecondaryEditor] Set area to:', area.toFixed(2));
    }
    if (this.elements.selectedDimensions) {
      const width = Math.round(region.width || 0);
      const height = Math.round(region.height || 0);
      this.elements.selectedDimensions.textContent = `${width}×${height}`;
      console.log('[SecondaryEditor] Set dimensions to:', `${width}×${height}`);
    }

    this.renderCanvas();
    this.updateRegionsList(); // Update list to show selection
  },

  deselectRegion() {
    this.state.selectedRegionId = null;
    this.state.selectedRegion = null;
    this.state.childRegions = [];

    if (this.elements.selectedInfo) {
      this.elements.selectedInfo.style.display = 'none';
    }
    if (this.elements.subdivisionTools) {
      this.elements.subdivisionTools.style.display = 'none';
    }

    this.renderCanvas();
  },

  updateRegionsList() {
    if (!this.elements.regionsList) return;

    this.elements.regionsList.innerHTML = '';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (const region of this.state.originalRegions) {
      const isSelected = region.id === this.state.selectedRegionId;
      const hasSubdivisions = region.has_subdivisions && region.child_regions && region.child_regions.length > 0;

      const item = document.createElement('div');
      item.className = `region-list-item ${isSelected ? 'selected' : ''} ${hasSubdivisions ? 'has-subdivisions' : ''}`;
      item.dataset.regionId = region.id;

      // Calculate total child area if subdivided
      // Calculate total child area if subdivided - use leaf nodes to be accurate
      let totalChildArea = 0;
      let leafChildren = [];

      if (hasSubdivisions) {
        leafChildren = this.getAllLeafRegions(region);
        totalChildArea = leafChildren.reduce((sum, child) => sum + child.area, 0);
      }

      let childrenHTML = '';
      if (hasSubdivisions) {
        childrenHTML = `
          <div class="subdivision-summary">
            <div class="summary-row">
              <span class="summary-label">切割前:</span>
              <span class="summary-value">${region.area.toFixed(2)} m²</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">切割後:</span>
              <span class="summary-value">${totalChildArea.toFixed(2)} m²</span>
            </div>
          </div>
          <div class="child-regions-list">
            ${leafChildren.map((child, idx) => `
              <div class="child-region-item">
                <span class="child-index">${child.name || child.label || (idx + 1)}</span>
                <span class="child-info">${child.area.toFixed(2)} m² (${Math.round(child.width)}×${Math.round(child.height)} mm)</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      item.innerHTML = `
        <div class="region-item-header">
          <span class="region-item-name">${region.name || region.label || `區域 ${region.id}`}</span>
          ${hasSubdivisions ? `<span class="region-item-badge">${leafChildren.length} 個子區域</span>` : ''}
        </div>
        <div class="region-item-stats">
          <span>📏 ${region.area.toFixed(2)} m²</span>
          <span>📐 ${Math.round(region.width)}×${Math.round(region.height)} mm</span>
        </div>
        ${childrenHTML}
      `;

      item.addEventListener('click', () => {
        this.selectRegion(region);
      });

      this.elements.regionsList.appendChild(item);
    }

    // Show the regions panel in right sidebar
    if (this.elements.secondaryRegionsPanel) {
      this.elements.secondaryRegionsPanel.style.display = 'block';
    }
  },

  // ============================================================
  // RENDERING
  // ============================================================

  renderCanvas() {
    if (!this.elements.canvas || !this.elements.ctx) return;

    const ctx = this.elements.ctx;
    const canvas = this.elements.canvas;

    // Clear canvas completely
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // First, draw base layers using SpacePlanningPage (columns, aisles, clearance, etc.)
    if (window.SpacePlanning && window.SpacePlanning.redraw) {
      window.SpacePlanning.redraw();
    }

    // Now draw our overlays - show ALL subdivisions, not just selected
    for (const region of this.state.originalRegions) {
      const isSelected = region.id === this.state.selectedRegionId;
      const hasSubdivisions = region.has_subdivisions && region.child_regions && region.child_regions.length > 0;

      if (hasSubdivisions) {
        // Draw child regions for ANY region that has subdivisions
        const childRegionsToRender = isSelected ? this.state.childRegions : region.child_regions;

        // Helper to draw children recursively effectively
        const drawChildren = (children) => {
          for (const child of children) {
            const isChildSelected = child.id === this.state.selectedRegionId;

            // If this child ITSELF has subdivisions, we should draw ITS children instead of itself
            // unless it's the one currently selected (maybe?) No, visualization should follow structure.
            if (child.has_subdivisions && child.child_regions && child.child_regions.length > 0) {
              drawChildren(child.child_regions);
            } else {
              this.drawRegionOverlay(ctx, child, isChildSelected ? 'selected' : 'child');
            }
          }
        };

        drawChildren(childRegionsToRender);
      } else {
        // Draw original region if it has no subdivisions
        const style = isSelected ? 'selected' : 'normal';
        this.drawRegionOverlay(ctx, region, style);
      }
    }

    // Draw split line preview
    if (this.state.currentSplitLine) {
      this.drawSplitLinePreview(ctx, this.state.currentSplitLine);
    }
  },

  drawRegionOverlay(ctx, region, style) {
    const screenPos = this.worldToScreen(region.x, region.y);
    const scale = this.getScale();

    const width = region.width * scale;
    const height = region.height * scale;
    const x = screenPos.x - width / 2;
    const y = screenPos.y - height / 2;

    // Set style based on type
    if (style === 'selected') {
      // Yellow highlight for selected region
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;
      ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
    } else if (style === 'child') {
      // Green overlay for child regions
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
    } else {
      // Normal usable region
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    }

    // Draw rectangle
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.fill();
    ctx.stroke();

    // Draw region name for child regions
    if (style === 'child') {
      const regionName = region.name || region.label || '';
      if (regionName) {
        ctx.save();

        const fontSize = Math.max(14, Math.min(24, height * 0.3));
        ctx.font = `bold ${fontSize}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Text with outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 4;
        ctx.strokeText(regionName, screenPos.x, screenPos.y);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(regionName, screenPos.x, screenPos.y);

        ctx.restore();
      }

      // Draw area label
      if (region.area) {
        ctx.save();

        const areaText = `${region.area.toFixed(1)} m²`;
        const fontSize = Math.max(10, Math.min(14, height * 0.15));
        ctx.font = `${fontSize}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textY = screenPos.y + fontSize + 4;

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(areaText, screenPos.x, textY);

        ctx.fillStyle = '#22c55e';
        ctx.fillText(areaText, screenPos.x, textY);

        ctx.restore();
      }
    }
  },

  drawSplitLinePreview(ctx, line) {
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(line.start.x, line.start.y);
    ctx.lineTo(line.end.x, line.end.y);
    ctx.stroke();

    ctx.setLineDash([]);
  },

  // ============================================================
  // COORDINATE CONVERSION
  // ============================================================

  worldToScreen(worldX, worldY) {
    // Use SpacePlanningPage's coordinate system if available
    if (window.SpacePlanning && window.SpacePlanning.worldToScreen) {
      return window.SpacePlanning.worldToScreen(worldX, worldY);
    }

    // Fallback to own implementation
    const canvas = this.elements.canvas;
    if (!canvas || !this.state.containerConfig) return { x: 0, y: 0 };

    const bounds = this.getContainerBounds();
    const containerWidth = bounds.maxX - bounds.minX;
    const containerHeight = bounds.maxZ - bounds.minZ;

    const scaleX = canvas.width / containerWidth;
    const scaleY = canvas.height / containerHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9;

    const offsetX = (canvas.width - containerWidth * scale) / 2;
    const offsetY = (canvas.height - containerHeight * scale) / 2;

    return {
      x: worldX * scale + offsetX,
      y: worldY * scale + offsetY
    };
  },

  screenToWorld(screenX, screenY) {
    // Use SpacePlanningPage's coordinate system if available
    if (window.SpacePlanning && window.SpacePlanning.screenToWorld) {
      return window.SpacePlanning.screenToWorld(screenX, screenY);
    }

    // Fallback to own implementation
    const canvas = this.elements.canvas;
    if (!canvas || !this.state.containerConfig) return { x: 0, y: 0 };

    const bounds = this.getContainerBounds();
    const containerWidth = bounds.maxX - bounds.minX;
    const containerHeight = bounds.maxZ - bounds.minZ;

    const scaleX = canvas.width / containerWidth;
    const scaleY = canvas.height / containerHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9;

    const offsetX = (canvas.width - containerWidth * scale) / 2;
    const offsetY = (canvas.height - containerHeight * scale) / 2;

    return {
      x: (screenX - offsetX) / scale,
      y: (screenY - offsetY) / scale
    };
  },

  getContainerBounds() {
    if (!this.state.containerConfig) {
      return { minX: 0, maxX: 10000, minZ: 0, maxZ: 10000 };
    }

    const config = this.state.containerConfig;
    return {
      minX: 0,
      maxX: config.widthX || 10000,
      minZ: 0,
      maxZ: config.depthZ || 10000
    };
  },

  getScale() {
    // Use SpacePlanningPage's scale if available
    if (window.SpacePlanning && window.SpacePlanning.getScale) {
      return window.SpacePlanning.getScale();
    }

    // Fallback
    if (!this.state.containerConfig) return 0.1;

    const canvas = this.elements.canvas;
    const bounds = this.getContainerBounds();
    const containerWidth = bounds.maxX - bounds.minX;
    const containerHeight = bounds.maxZ - bounds.minZ;

    const scaleX = canvas.width / containerWidth;
    const scaleY = canvas.height / containerHeight;

    return Math.min(scaleX, scaleY) * 0.9;
  },

  // ============================================================
  // MODE MANAGEMENT
  // ============================================================

  exitEditMode() {
    console.log('[SecondaryEditor] Exiting edit mode...');

    // Restore original regions (discard changes)
    const storedZones = localStorage.getItem('generatedZones');
    if (storedZones) {
      const zones = JSON.parse(storedZones);
      this.state.originalRegions = zones.filter(z => z.type === 'usable');
    }

    // Clear selection state
    this.state.selectedRegionId = null;
    this.state.selectedRegion = null;
    this.state.childRegions = [];
    this.state.mode = 'view';

    // Restore normal UI
    if (window.SpacePlanning && window.SpacePlanning.exitSecondaryEditMode) {
      window.SpacePlanning.exitSecondaryEditMode();
    }
  },

  resetAllSubdivisions() {
    if (!confirm('確定要重設所有細分嗎？此操作無法復原。')) return;

    console.log('[SecondaryEditor] Resetting all subdivisions...');

    // Clear all subdivisions from original regions
    for (const region of this.state.originalRegions) {
      region.has_subdivisions = false;
      region.child_regions = [];
      delete region.subdivision_version;
    }

    // Clear current selection and child regions
    this.state.childRegions = [];
    this.state.selectedRegionId = null;
    this.state.selectedRegion = null;

    // Hide selection UI
    if (this.elements.selectedInfo) {
      this.elements.selectedInfo.style.display = 'none';
    }
    if (this.elements.subdivisionTools) {
      this.elements.subdivisionTools.style.display = 'none';
    }

    // Force immediate canvas update
    this.renderCanvas();
    this.updateRegionsList();

    console.log('[SecondaryEditor] All subdivisions reset and canvas updated');
  },

  applyAndContinue() {
    console.log('[SecondaryEditor] Applying subdivisions and continuing...');

    // Save regions with subdivisions
    const regionsWithSubdivisions = this.state.originalRegions.map(region => ({
      ...region,
      has_subdivisions: region.has_subdivisions || false,
      child_regions: region.child_regions || []
    }));

    localStorage.setItem('usableRegionsWithSubdivisions', JSON.stringify(regionsWithSubdivisions));

    console.log('[SecondaryEditor] Saved regions:', regionsWithSubdivisions.length);
    console.log('[SecondaryEditor] Subdivided regions:',
      regionsWithSubdivisions.filter(r => r.has_subdivisions).length);

    // Navigate to allocation page
    window.location.hash = '/assign-space';
  }
};

// Make globally accessible
window.SecondaryRegionEditor = SecondaryRegionEditor;
