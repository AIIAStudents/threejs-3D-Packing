
// Space Planning Page - Constraint-Based Generation
// Replaces manual drawing with automatic space generation

const API_BASE_URL = 'http://localhost:8888';

export const SpacePlanningPage = {
  state: {
    containerConfig: null,

    // Coordinate system (aligned with YAML spec)
    coordinateSystem: {
      x_axis: 'length',
      y_axis: 'height',
      z_axis: 'depth'
    },

    // Layout plan metadata
    layoutPlan: {
      layout_id: null,
      source: {
        columns_enabled: true,
        aisles_enabled: true,
        safety_margin_enabled: true,
        usable_area_ratio: 0
      },
      generated_at: null
    },

    constraints: {
      building: {
        columns: {
          mode: 'rule_based', // 'rule_based' or 'exception_based'
          columnWidth: 400,
          columnDepth: 400,
          spacingX: 6000,
          spacingZ: 6000,
          wallOffset: 500,
          customColumns: [] // For exception_based mode
        },
        wallClearance: 300
      },
      circulation: {
        mainAisle: {
          enabled: false,
          width: 3000,
          direction: 'along_length', // 'along_length' or 'along_width'
          position: 'center' // 'center', 'offset_left', 'offset_right'
        },
        forkliftAisles: {
          enabled: false,
          count: 2,
          width: 1500,
          spacing: 'auto'
        }
      },
    },

    // Generated zones with type classification
    zones: [],

    // Layer visibility toggles
    layerVisibility: {
      columns: true,
      aisles: true,
      clearance: true,
      usable: true
    }
  },

  elements: {},
  isInitialized: false,
  renderRequested: false,

  async init() {
    this.bindDOM();
    this.addEventListeners();

    if (!this.isInitialized) {
      window.addEventListener('resize', () => {
        this.resizeCanvas();
        this.requestRender();
      });
      this.isInitialized = true;
    }

    // Move modal to body level to ensure it can cover sidebar
    if (this.elements.canvasModal && this.elements.canvasModal.parentElement) {
      document.body.appendChild(this.elements.canvasModal);
      console.log('[SpacePlanning] Moved modal to body level');
    }

    await this.loadData();
    this.resizeCanvas();
    this.requestRender();
  },

  bindDOM() {
    // Canvas
    this.elements.canvas = document.getElementById('planning-canvas');
    if (this.elements.canvas) {
      this.elements.ctx = this.elements.canvas.getContext('2d');
    }

    // Constraint inputs - Building
    this.elements.columnMode = document.getElementById('column-mode');
    this.elements.columnWidth = document.getElementById('column-width');
    this.elements.columnDepth = document.getElementById('column-depth');
    this.elements.spacingX = document.getElementById('spacing-x');
    this.elements.spacingZ = document.getElementById('spacing-z');
    this.elements.wallOffset = document.getElementById('wall-offset');
    this.elements.wallClearance = document.getElementById('wall-clearance');
    this.elements.customColumnsList = document.getElementById('custom-columns-list');
    this.elements.btnAddColumn = document.getElementById('btn-add-column');

    // Constraint inputs - Circulation
    this.elements.mainAisleEnabled = document.getElementById('main-aisle-enabled');
    this.elements.mainAisleWidth = document.getElementById('main-aisle-width');
    this.elements.mainAisleDirection = document.getElementById('main-aisle-direction');
    this.elements.mainAislePosition = document.getElementById('main-aisle-position');
    this.elements.forkliftEnabled = document.getElementById('forklift-aisles-enabled');
    this.elements.forkliftCount = document.getElementById('forklift-count');
    this.elements.forkliftWidth = document.getElementById('forklift-width');
    this.elements.forkliftSpacing = document.getElementById('forklift-spacing');

    // Layer toggles
    this.elements.showColumns = document.getElementById('show-columns');
    this.elements.showAisles = document.getElementById('show-aisles');
    this.elements.showClearance = document.getElementById('show-clearance');
    this.elements.showUsable = document.getElementById('show-usable');

    // Results
    this.elements.totalArea = document.getElementById('total-area');
    this.elements.unusableArea = document.getElementById('unusable-area');
    this.elements.usableArea = document.getElementById('usable-area');
    this.elements.utilization = document.getElementById('utilization');
    this.elements.columnsArea = document.getElementById('columns-area');
    this.elements.aislesArea = document.getElementById('aisles-area');
    this.elements.clearanceArea = document.getElementById('clearance-area');
    this.elements.usableBlocksList = document.getElementById('usable-blocks-list');

    // Action buttons
    this.elements.btnGenerate = document.getElementById('btn-generate');
    this.elements.btnReset = document.getElementById('btn-reset');
    this.elements.btnSave = document.getElementById('btn-save');
    this.elements.btnNextStep = document.getElementById('btn-next-step');
    this.elements.btnPrevStep = document.getElementById('btn-prev-step');

    // Modal
    this.elements.btnExpandCanvas = document.getElementById('btn-expand-canvas');
    this.elements.canvasModal = document.getElementById('canvas-modal');
    this.elements.btnCloseModal = document.getElementById('btn-close-modal');
    this.elements.canvasExpanded = document.getElementById('planning-canvas-expanded');
    if (this.elements.canvasExpanded) {
      this.elements.ctxExpanded = this.elements.canvasExpanded.getContext('2d');
    }
  },

  addEventListeners() {
    // Column mode toggle
    if (this.elements.columnMode) {
      this.elements.columnMode.addEventListener('change', (e) => {
        const ruleParams = document.getElementById('rule-based-params');
        const exceptionParams = document.getElementById('exception-based-params');

        if (e.target.value === 'rule_based') {
          ruleParams.style.display = 'block';
          exceptionParams.style.display = 'none';
        } else {
          ruleParams.style.display = 'none';
          exceptionParams.style.display = 'block';
        }

        this.state.constraints.building.columns.mode = e.target.value;
      });
    }

    // Main aisle toggle
    if (this.elements.mainAisleEnabled) {
      this.elements.mainAisleEnabled.addEventListener('change', (e) => {
        const params = document.getElementById('main-aisle-params');
        params.style.display = e.target.checked ? 'block' : 'none';
        this.state.constraints.circulation.mainAisle.enabled = e.target.checked;
      });
    }

    // Forklift aisles toggle
    if (this.elements.forkliftEnabled) {
      this.elements.forkliftEnabled.addEventListener('change', (e) => {
        const params = document.getElementById('forklift-aisles-params');
        params.style.display = e.target.checked ? 'block' : 'none';
        this.state.constraints.circulation.forkliftAisles.enabled = e.target.checked;
      });
    }

    // Main aisle direction change
    if (this.elements.mainAisleDirection) {
      this.elements.mainAisleDirection.addEventListener('change', (e) => {
        this.state.constraints.circulation.mainAisle.direction = e.target.value;
        console.log('[SpacePlanning] Main aisle direction changed to:', e.target.value);
      });
    }

    // Main aisle position change
    if (this.elements.mainAislePosition) {
      this.elements.mainAislePosition.addEventListener('change', (e) => {
        this.state.constraints.circulation.mainAisle.position = e.target.value;
        console.log('[SpacePlanning] Main aisle position changed to:', e.target.value);
      });
    }

    // Main aisle width change
    if (this.elements.mainAisleWidth) {
      this.elements.mainAisleWidth.addEventListener('change', (e) => {
        this.state.constraints.circulation.mainAisle.width = parseInt(e.target.value);
        console.log('[SpacePlanning] Main aisle width changed to:', e.target.value);
      });
    }

    // Forklift count change
    if (this.elements.forkliftCount) {
      this.elements.forkliftCount.addEventListener('change', (e) => {
        this.state.constraints.circulation.forkliftAisles.count = parseInt(e.target.value);
        console.log('[SpacePlanning] Forklift count changed to:', e.target.value);
      });
    }

    // Forklift width change
    if (this.elements.forkliftWidth) {
      this.elements.forkliftWidth.addEventListener('change', (e) => {
        this.state.constraints.circulation.forkliftAisles.width = parseInt(e.target.value);
        console.log('[SpacePlanning] Forklift width changed to:', e.target.value);
      });
    }

    // Layer visibility toggles
    ['columns', 'aisles', 'clearance', 'usable'].forEach(layer => {
      const toggle = this.elements[`show${layer.charAt(0).toUpperCase() + layer.slice(1)}`];
      if (toggle) {
        toggle.addEventListener('change', (e) => {
          this.state.layerVisibility[layer] = e.target.checked;
          this.requestRender();
        });
      }
    });

    // Add custom column button
    if (this.elements.btnAddColumn) {
      this.elements.btnAddColumn.addEventListener('click', () => this.addCustomColumn());
    }

    // Generate button
    if (this.elements.btnGenerate) {
      this.elements.btnGenerate.addEventListener('click', () => this.generateSpaces());
    }

    // Reset button
    if (this.elements.btnReset) {
      this.elements.btnReset.addEventListener('click', () => this.resetConstraints());
    }

    // Navigation

    if (this.elements.btnSave) {
      this.elements.btnSave.addEventListener('click', () => this.saveSpaces());
    }
    // Next step button
    if (this.elements.btnNextStep) {
      this.elements.btnNextStep.addEventListener('click', () => {
        // Always enter secondary edit mode first
        // User can skip by clicking "Apply & Continue" without making changes
        this.enterSecondaryEditMode();
      });
    }

    // Previous step button
    if (this.elements.btnPrevStep) {
      this.elements.btnPrevStep.addEventListener('click', (event) => {
        // Check if edit mode buttons are visible to determine mode
        const editButtons = document.getElementById('edit-mode-buttons');
        const isInEditMode = editButtons && editButtons.style.display !== 'none';

        if (isInEditMode) {
          // In edit mode - exit to normal mode (STAY on same page)
          event.preventDefault();
          event.stopPropagation();

          if (window.SecondaryRegionEditor && window.SecondaryRegionEditor.exitEditMode) {
            window.SecondaryRegionEditor.exitEditMode();
          }

          console.log('[SpacePlanning] Exited edit mode, staying on cut-container page');
          return; // Stop here, don't navigate
        } else {
          // Normal mode - navigate to previous page
          window.location.hash = '/define-container';
        }
      });
    }

    // Modal controls
    if (this.elements.btnExpandCanvas) {
      this.elements.btnExpandCanvas.addEventListener('click', () => {
        this.openExpandedView();
      });
    }

    if (this.elements.btnCloseModal) {
      this.elements.btnCloseModal.addEventListener('click', () => {
        this.closeExpandedView();
      });
    }

    // Close modal when clicking outside
    if (this.elements.canvasModal) {
      this.elements.canvasModal.addEventListener('click', (e) => {
        if (e.target === this.elements.canvasModal) {
          this.closeExpandedView();
        }
      });
    }

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.elements.canvasModal && this.elements.canvasModal.style.display !== 'none') {
        this.closeExpandedView();
      }
    });

    // Column modal events
    const columnModal = document.getElementById('column-modal');
    const columnForm = document.getElementById('column-form');
    const btnCloseColumnModal = document.getElementById('btn-close-column-modal');
    const btnCancelColumn = document.getElementById('btn-cancel-column');

    if (columnForm) {
      columnForm.addEventListener('submit', (e) => this.submitCustomColumn(e));
    }
    if (btnCloseColumnModal) {
      btnCloseColumnModal.addEventListener('click', () => this.closeColumnModal());
    }
    if (btnCancelColumn) {
      btnCancelColumn.addEventListener('click', () => this.closeColumnModal());
    }
    if (columnModal) {
      columnModal.addEventListener('click', (e) => {
        if (e.target === columnModal) {
          this.closeColumnModal();
        }
      });
    }
  },

  async loadData() {
    // Load container config
    const storedConfig = localStorage.getItem('containerConfig');
    if (storedConfig) {
      try {
        this.state.containerConfig = JSON.parse(storedConfig);
        console.log('[SpacePlanning] Loaded container config:', this.state.containerConfig);
      } catch (e) {
        console.warn('Failed to parse container config:', e);
      }
    }

    // Load saved constraints if available
    const storedConstraints = localStorage.getItem('spaceConstraints');
    if (storedConstraints) {
      try {
        const saved = JSON.parse(storedConstraints);
        this.state.constraints = { ...this.state.constraints, ...saved };
        this.syncConstraintsToUI();
        console.log('[SpacePlanning] Loaded saved constraints');
      } catch (e) {
        console.warn('Failed to parse constraints:', e);
      }
    }

    // Load saved zones if available
    const storedZones = localStorage.getItem('generatedZones');
    if (storedZones) {
      try {
        this.state.zones = JSON.parse(storedZones);
        this.updateStatistics();
        this.updateUsableBlocksList();
        console.log('[SpacePlanning] Loaded saved zones');
      } catch (e) {
        console.warn('Failed to parse zones:', e);
      }
    }
  },

  syncConstraintsToUI() {
    const c = this.state.constraints;

    // Building constraints
    if (this.elements.columnWidth) this.elements.columnWidth.value = c.building.columns.columnWidth;
    if (this.elements.columnDepth) this.elements.columnDepth.value = c.building.columns.columnDepth;
    if (this.elements.spacingX) this.elements.spacingX.value = c.building.columns.spacingX;
    if (this.elements.spacingZ) this.elements.spacingZ.value = c.building.columns.spacingZ;
    if (this.elements.wallOffset) this.elements.wallOffset.value = c.building.columns.wallOffset;
    if (this.elements.wallClearance) this.elements.wallClearance.value = c.building.wallClearance;

    // Circulation constraints
    if (this.elements.mainAisleEnabled) this.elements.mainAisleEnabled.checked = c.circulation.mainAisle.enabled;
    if (this.elements.mainAisleWidth) this.elements.mainAisleWidth.value = c.circulation.mainAisle.width;
    if (this.elements.mainAisleDirection) this.elements.mainAisleDirection.value = c.circulation.mainAisle.direction;
    if (this.elements.mainAislePosition) this.elements.mainAislePosition.value = c.circulation.mainAisle.position;

    if (this.elements.forkliftEnabled) this.elements.forkliftEnabled.checked = c.circulation.forkliftAisles.enabled;
    if (this.elements.forkliftCount) this.elements.forkliftCount.value = c.circulation.forkliftAisles.count;
    if (this.elements.forkliftWidth) this.elements.forkliftWidth.value = c.circulation.forkliftAisles.width;
  },

  addCustomColumn() {
    // Show modal instead of prompt
    const modal = document.getElementById('column-modal');
    if (modal) {
      modal.classList.add('active');
    }
  },

  submitCustomColumn(e) {
    e.preventDefault();

    const x = parseInt(document.getElementById('column-x').value);
    const z = parseInt(document.getElementById('column-z').value);
    const width = parseInt(document.getElementById('column-width-input').value);
    const depth = parseInt(document.getElementById('column-depth-input').value);

    if (isNaN(x) || isNaN(z) || isNaN(width) || isNaN(depth)) {
      alert('請輸入有效的數字');
      return;
    }

    if (!this.state.constraints.building.columns.customColumns) {
      this.state.constraints.building.columns.customColumns = [];
    }

    const columnId = `custom_${Date.now()}`;
    this.state.constraints.building.columns.customColumns.push({
      id: columnId,
      x: x,
      z: z,
      width: width,
      depth: depth
    });

    console.log('[SpacePlanning] Added custom column:', { x, z, width, depth });
    this.updateCustomColumnsList();

    // Close modal
    const modal = document.getElementById('column-modal');
    if (modal) {
      modal.classList.remove('active');
    }

    // Reset form
    document.getElementById('column-form').reset();
  },

  closeColumnModal() {
    const modal = document.getElementById('column-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  },

  updateCustomColumnsList() {
    const list = this.elements.customColumnsList;
    if (!list) return;

    const columns = this.state.constraints.building.columns.customColumns || [];

    if (columns.length === 0) {
      list.innerHTML = '<p class="hint">點擊下方按鈕新增自訂柱位</p>';
      return;
    }

    list.innerHTML = columns.map((col, index) => `
      <div class="custom-column-item" data-id="${col.id}">
        <div class="info">
          柱 ${index + 1}: (${col.x}, ${col.z}) - ${col.width}×${col.depth}mm
        </div>
        <button class="btn-remove" onclick="SpacePlanning.removeCustomColumn('${col.id}')">刪除</button>
      </div>
    `).join('');
  },

  removeCustomColumn(columnId) {
    const columns = this.state.constraints.building.columns.customColumns || [];
    this.state.constraints.building.columns.customColumns = columns.filter(c => c.id !== columnId);
    console.log('[SpacePlanning] Removed custom column:', columnId);
    this.updateCustomColumnsList();
  },

  readConstraintsFromUI() {
    const c = this.state.constraints;

    // Building constraints
    c.building.columns.mode = this.elements.columnMode?.value || 'rule_based';
    c.building.columns.columnWidth = parseFloat(this.elements.columnWidth?.value) || 400;
    c.building.columns.columnDepth = parseFloat(this.elements.columnDepth?.value) || 400;
    c.building.columns.spacingX = parseFloat(this.elements.spacingX?.value) || 6000;
    c.building.columns.spacingZ = parseFloat(this.elements.spacingZ?.value) || 6000;
    c.building.columns.wallOffset = parseFloat(this.elements.wallOffset?.value) || 500;
    c.building.wallClearance = parseFloat(this.elements.wallClearance?.value) || 300;

    // Circulation constraints
    c.circulation.mainAisle.enabled = this.elements.mainAisleEnabled?.checked || false;
    c.circulation.mainAisle.width = parseFloat(this.elements.mainAisleWidth?.value) || 2000;
    c.circulation.mainAisle.direction = this.elements.mainAisleDirection?.value || 'along_length';
    c.circulation.mainAisle.position = this.elements.mainAislePosition?.value || 'center';

    c.circulation.forkliftAisles.enabled = this.elements.forkliftEnabled?.checked || false;
    c.circulation.forkliftAisles.count = parseInt(this.elements.forkliftCount?.value) || 2;
    c.circulation.forkliftAisles.width = parseFloat(this.elements.forkliftWidth?.value) || 1500;
  },

  // ============================================================
  // SPACE GENERATION LOGIC
  // ============================================================

  generateSpaces() {
    if (!this.state.containerConfig) {
      alert('請先定義容器尺寸');
      return;
    }

    console.log('[SpacePlanning] ========== Generating spaces ==========');
    console.log('[SpacePlanning] Container config:', this.state.containerConfig);

    // Read current constraints from UI
    this.readConstraintsFromUI();
    console.log('[SpacePlanning] Constraints:', this.state.constraints);

    // Initialize layout plan metadata
    this.state.layoutPlan = {
      layout_id: `layout_${Date.now()}`,
      source: {
        columns_enabled: this.state.constraints.building.columns.mode !== 'none',
        aisles_enabled: this.state.constraints.circulation.mainAisle.enabled ||
          this.state.constraints.circulation.forkliftAisles.enabled,
        safety_margin_enabled: this.state.constraints.building.wallClearance > 0,
        usable_area_ratio: 0 // Will be calculated after generation
      },
      generated_at: new Date().toISOString()
    };

    // Clear existing zones
    this.state.zones = [];

    // Generate unusable zones
    console.log('[SpacePlanning] Step 1: Generating aisles...');
    this.generateAisleZones();

    console.log('[SpacePlanning] Step 2: Generating wall clearances...');
    this.generateWallClearanceZones();

    console.log('[SpacePlanning] Step 3: Generating columns...');
    this.generateColumnZones();

    // Calculate usable spaces
    console.log('[SpacePlanning] Step 4: Calculating usable spaces...');
    this.calculateUsableSpaces();

    // Calculate usable area ratio
    const totalArea = this.state.containerConfig.widthX * this.state.containerConfig.depthZ;
    const usableArea = this.state.zones
      .filter(z => z.type === 'usable')
      .reduce((sum, z) => sum + (z.width * z.height), 0);
    this.state.layoutPlan.source.usable_area_ratio = totalArea > 0 ? usableArea / totalArea : 0;

    console.log('[SpacePlanning] Total zones generated:', this.state.zones.length);
    console.log('[SpacePlanning] Zones by type:', {
      columns: this.state.zones.filter(z => z.type === 'unusable_column').length,
      clearances: this.state.zones.filter(z => z.type === 'unusable_clearance').length,
      aisles: this.state.zones.filter(z => z.type === 'unusable_aisle').length,
      usable: this.state.zones.filter(z => z.type === 'usable').length
    });
    console.log('[SpacePlanning] Usable area ratio:', (this.state.layoutPlan.source.usable_area_ratio * 100).toFixed(2) + '%');

    // Update UI
    this.updateStatistics();
    this.updateUsableBlocksList();
    this.requestRender();

    console.log('[SpacePlanning] ========== Generation complete ==========');
  },

  generateColumnZones() {
    const config = this.state.containerConfig;
    const columns = this.state.constraints.building.columns;

    if (columns.mode === 'rule_based') {
      // Generate grid-based columns
      const { columnWidth, columnDepth, spacingX, spacingZ, wallOffset } = columns;

      // Calculate grid positions based on container shape
      const bounds = this.getContainerBounds();

      console.log('[SpacePlanning] Generating columns with bounds:', bounds);
      console.log('[SpacePlanning] Column params:', { columnWidth, columnDepth, spacingX, spacingZ, wallOffset });

      // Start from wallOffset and iterate
      let columnCount = 0;
      for (let x = wallOffset; x < bounds.maxX - wallOffset; x += spacingX) {
        for (let z = wallOffset; z < bounds.maxZ - wallOffset; z += spacingZ) {
          // Calculate column center position
          const centerX = x + columnWidth / 2;
          const centerZ = z + columnDepth / 2;

          // Check if column fits within bounds
          if (x + columnWidth > bounds.maxX - wallOffset) continue;
          if (z + columnDepth > bounds.maxZ - wallOffset) continue;

          // Check if this position is inside container (for T/U shapes)
          if (this.isPointInContainer(centerX, centerZ)) {
            // Check if column overlaps with any existing aisle
            const overlapsAisle = this.state.zones.some(zone => {
              if (zone.type !== 'unusable_aisle') return false;

              const colLeft = x;
              const colRight = x + columnWidth;
              const colTop = z;
              const colBottom = z + columnDepth;

              const aisleLeft = zone.x - zone.width / 2;
              const aisleRight = zone.x + zone.width / 2;
              const aisleTop = zone.y - zone.height / 2;
              const aisleBottom = zone.y + zone.height / 2;

              return !(colRight < aisleLeft ||
                colLeft > aisleRight ||
                colBottom < aisleTop ||
                colTop > aisleBottom);
            });

            if (overlapsAisle) {
              console.log(`[SpacePlanning] Skipping column at (${Math.round(centerX)}, ${Math.round(centerZ)}) - overlaps aisle`);
              continue;
            }

            this.state.zones.push({
              id: `column_${columnCount}`,
              type: 'unusable_column',
              x: centerX,
              y: centerZ,
              width: columnWidth,
              height: columnDepth,
              depth: config.heightY || 2400,
              metadata: {
                reason: `柱 ${columnCount + 1}`
              }
            });
            columnCount++;
            console.log(`[SpacePlanning] Generated column at (${Math.round(centerX)}, ${Math.round(centerZ)})`);
          }
        }
      }

      console.log(`[SpacePlanning] Total columns generated: ${columnCount}`);
    } else {
      // Exception-based: use custom columns
      columns.customColumns.forEach((col, index) => {
        this.state.zones.push({
          id: `column_custom_${index}`,
          type: 'unusable_column',
          x: col.x,
          y: col.z,
          width: col.width,
          height: col.depth,
          depth: config.heightY || 2400,
          metadata: {
            reason: `自訂柱 ${index + 1}`
          }
        });
      });
    }
  },

  generateWallClearanceZones() {
    const config = this.state.containerConfig;
    const clearance = this.state.constraints.building.wallClearance;

    if (clearance <= 0) return;

    // For rectangular container, create clearance strips along perimeter
    if (config.shape === 'rect') {
      const { widthX, depthZ, heightY } = config;

      // Top strip
      this.state.zones.push({
        id: `clearance_top`,
        type: 'unusable_clearance',
        x: widthX / 2,
        y: clearance / 2,
        width: widthX,
        height: clearance,
        depth: heightY || 2400,
        metadata: { reason: '牆邊安全距 (上)' }
      });

      // Bottom strip
      this.state.zones.push({
        id: `clearance_bottom`,
        type: 'unusable_clearance',
        x: widthX / 2,
        y: depthZ - clearance / 2,
        width: widthX,
        height: clearance,
        depth: heightY || 2400,
        metadata: { reason: '牆邊安全距 (下)' }
      });

      // Left strip
      this.state.zones.push({
        id: `clearance_left`,
        type: 'unusable_clearance',
        x: clearance / 2,
        y: depthZ / 2,
        width: clearance,
        height: depthZ,
        depth: heightY || 2400,
        metadata: { reason: '牆邊安全距 (左)' }
      });

      // Right strip
      this.state.zones.push({
        id: `clearance_right`,
        type: 'unusable_clearance',
        x: widthX - clearance / 2,
        y: depthZ / 2,
        width: clearance,
        height: depthZ,
        depth: heightY || 2400,
        metadata: { reason: '牆邊安全距 (右)' }
      });
    }
    // TODO: Handle T-shape and U-shape clearance
  },

  generateAisleZones() {
    const config = this.state.containerConfig;
    const mainAisle = this.state.constraints.circulation.mainAisle;

    if (!mainAisle.enabled) return;

    if (config.shape === 'rect') {
      const { widthX, depthZ, heightY } = config;

      let x, y, width, height;

      if (mainAisle.direction === 'along_length') {
        // Horizontal aisle
        width = widthX;
        height = mainAisle.width;
        x = widthX / 2;

        if (mainAisle.position === 'center') {
          y = depthZ / 2;
        } else if (mainAisle.position === 'offset_left') {
          y = depthZ / 3;
        } else {
          y = depthZ * 2 / 3;
        }
      } else {
        // Vertical aisle
        width = mainAisle.width;
        height = depthZ;
        y = depthZ / 2;

        if (mainAisle.position === 'center') {
          x = widthX / 2;
        } else if (mainAisle.position === 'offset_left') {
          x = widthX / 3;
        } else {
          x = widthX * 2 / 3;
        }
      }

      this.state.zones.push({
        id: `aisle_main`,
        type: 'unusable_aisle',
        x, y, width, height,
        depth: heightY || 2400,
        metadata: { reason: '主走道' }
      });

      console.log(`[SpacePlanning] Generated main aisle at (${Math.round(x)}, ${Math.round(y)}) size ${Math.round(width)}x${Math.round(height)}`);
    }

    // Generate forklift aisles
    const forklift = this.state.constraints.circulation.forkliftAisles;
    if (forklift.enabled && config.shape === 'rect') {
      const { widthX, depthZ, heightY } = config;
      const count = forklift.count || 2;
      const aisleWidth = forklift.width || 1500;

      // Generate vertical forklift aisles evenly spaced
      const spacing = widthX / (count + 1);

      for (let i = 1; i <= count; i++) {
        const x = spacing * i;
        const y = depthZ / 2;

        this.state.zones.push({
          id: `aisle_forklift_${i}`,
          type: 'unusable_aisle',
          x: x,
          y: y,
          width: aisleWidth,
          height: depthZ,
          depth: heightY || 2400,
          metadata: { reason: `叉車走道 ${i}` }
        });

        console.log(`[SpacePlanning] Generated forklift aisle ${i} at (${Math.round(x)}, ${Math.round(y)})`);
      }
    }
  },

  calculateUsableSpaces() {
    const config = this.state.containerConfig;

    // Simple implementation: create usable spaces based on aisles
    // In production, this would use spatial subtraction algorithm

    if (config.shape === 'rect') {
      const { widthX, depthZ, heightY } = config;
      const clearance = this.state.constraints.building.wallClearance;

      // Calculate effective usable area (simplified)
      const effectiveX = widthX - 2 * clearance;
      const effectiveZ = depthZ - 2 * clearance;

      // For now, create two usable blocks split by main aisle
      const mainAisle = this.state.constraints.circulation.mainAisle;

      if (mainAisle.enabled && mainAisle.direction === 'along_length') {
        // Top block
        const region1_height = depthZ / 2 - mainAisle.width / 2 - clearance;
        const region1_y = clearance + region1_height / 2;

        this.state.zones.push({
          id: `usable_1`,
          type: 'usable',
          name: '區域 1',

          // Center point (legacy format for rendering)
          x: widthX / 2,
          y: region1_y,
          width: effectiveX,
          height: region1_height,
          depth: heightY || 2400,

          // YAML-compliant geometry_2d
          geometry_2d: {
            kind: 'rect',
            rect: {
              x_min_mm: clearance,
              x_max_mm: widthX - clearance,
              z_min_mm: clearance,
              z_max_mm: depthZ / 2 - mainAisle.width / 2
            }
          },

          // Height policy
          height_policy: {
            mode: 'inherit_container',
            y_mm: heightY || 2400
          },

          // Calculated metrics
          metrics: {
            area_m2: Math.round((effectiveX * region1_height) / 1000000 * 100) / 100,
            volume_mm3: effectiveX * region1_height * (heightY || 2400),
            max_span_x_mm: effectiveX,
            max_span_z_mm: region1_height
          },

          // Tags
          tags: ['可用', '儲位'],

          // Legacy metadata
          label: '區域 1',
          metadata: { reason: '可規劃空間' }
        });

        // Bottom block
        const region2_height = depthZ / 2 - mainAisle.width / 2 - clearance;
        const region2_y = depthZ / 2 + mainAisle.width / 2 + region2_height / 2;

        this.state.zones.push({
          id: `usable_2`,
          type: 'usable',
          name: '區域 2',

          // Center point (legacy format for rendering)
          x: widthX / 2,
          y: region2_y,
          width: effectiveX,
          height: region2_height,
          depth: heightY || 2400,

          // YAML-compliant geometry_2d
          geometry_2d: {
            kind: 'rect',
            rect: {
              x_min_mm: clearance,
              x_max_mm: widthX - clearance,
              z_min_mm: depthZ / 2 + mainAisle.width / 2,
              z_max_mm: depthZ - clearance
            }
          },

          // Height policy
          height_policy: {
            mode: 'inherit_container',
            y_mm: heightY || 2400
          },

          // Calculated metrics
          metrics: {
            area_m2: Math.round((effectiveX * region2_height) / 1000000 * 100) / 100,
            volume_mm3: effectiveX * region2_height * (heightY || 2400),
            max_span_x_mm: effectiveX,
            max_span_z_mm: region2_height
          },

          // Tags
          tags: ['可用', '儲位'],

          // Legacy metadata
          label: '區域 2',
          metadata: { reason: '可規劃空間' }
        });
      } else {
        // Single usable block (no aisle or vertical aisle)
        this.state.zones.push({
          id: `usable_1`,
          type: 'usable',
          name: '區域 1',

          // Center point (legacy format for rendering)
          x: widthX / 2,
          y: depthZ / 2,
          width: effectiveX,
          height: effectiveZ,
          depth: heightY || 2400,

          // YAML-compliant geometry_2d
          geometry_2d: {
            kind: 'rect',
            rect: {
              x_min_mm: clearance,
              x_max_mm: widthX - clearance,
              z_min_mm: clearance,
              z_max_mm: depthZ - clearance
            }
          },

          // Height policy
          height_policy: {
            mode: 'inherit_container',
            y_mm: heightY || 2400
          },

          // Calculated metrics
          metrics: {
            area_m2: Math.round((effectiveX * effectiveZ) / 1000000 * 100) / 100,
            volume_mm3: effectiveX * effectiveZ * (heightY || 2400),
            max_span_x_mm: effectiveX,
            max_span_z_mm: effectiveZ
          },

          // Tags
          tags: ['可用', '儲位'],

          // Legacy metadata
          label: '區域 1',
          metadata: { reason: '可規劃空間' }
        });
      }
    }
  },

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  getContainerBounds() {
    const config = this.state.containerConfig;

    switch (config.shape) {
      case 'rect':
        return {
          minX: 0,
          minZ: 0,
          maxX: config.widthX,
          maxZ: config.depthZ
        };
      case 't_shape':
        return {
          minX: 0,
          minZ: 0,
          maxX: config.topWidthX || config.t_top_x,
          maxZ: (config.bottomDepthZ || config.t_bottom_z) + (config.topDepthZ || config.t_top_z)
        };
      case 'u_shape':
        return {
          minX: 0,
          minZ: 0,
          maxX: config.outerWidthX || config.u_outer_x,
          maxZ: config.outerDepthZ || config.u_outer_z
        };
      default:
        return { minX: 0, minZ: 0, maxX: 5800, maxZ: 2300 };
    }
  },

  isPointInContainer(x, y) {
    const config = this.state.containerConfig;
    if (!config) return false;

    switch (config.shape) {
      case 'rect':
        return x >= 0 && x <= config.widthX && y >= 0 && y <= config.depthZ;

      case 't_shape': {
        const topWidthX = config.topWidthX || config.t_top_x;
        const topDepthZ = config.topDepthZ || config.t_top_z;
        const bottomWidthX = config.bottomWidthX || config.t_bottom_x;
        const bottomDepthZ = config.bottomDepthZ || config.t_bottom_z;
        const bottomLeft = (topWidthX - bottomWidthX) / 2;
        const bottomRight = bottomLeft + bottomWidthX;

        // In bottom (stem)
        if (y >= 0 && y <= bottomDepthZ) {
          return x >= bottomLeft && x <= bottomRight;
        }
        // In top (cross)
        if (y > bottomDepthZ && y <= bottomDepthZ + topDepthZ) {
          return x >= 0 && x <= topWidthX;
        }
        return false;
      }

      case 'u_shape': {
        const outerWidthX = config.outerWidthX || config.u_outer_x;
        const outerDepthZ = config.outerDepthZ || config.u_outer_z;
        const gapWidthX = config.gapWidthX || config.u_gap_x;
        const gapDepthZ = config.gapDepthZ || config.u_gap_z;

        // Inside outer rectangle
        if (x < 0 || x > outerWidthX || y < 0 || y > outerDepthZ) return false;

        // Not in gap
        const gapLeft = (outerWidthX - gapWidthX) / 2;
        const gapRight = (outerWidthX + gapWidthX) / 2;
        const gapTop = outerDepthZ - gapDepthZ;

        if (x >= gapLeft && x <= gapRight && y >= gapTop && y <= outerDepthZ) {
          return false; // In gap
        }
        return true;
      }

      default:
        return false;
    }
  },

  // ============================================================
  // UI UPDATE FUNCTIONS
  // ============================================================

  updateStatistics() {
    const config = this.state.containerConfig;
    if (!config) return;

    // Calculate areas
    const totalArea = (config.widthX * config.depthZ) / 1000000; // m²

    let columnsArea = 0;
    let aislesArea = 0;
    let clearanceArea = 0;
    let usableArea = 0;

    this.state.zones.forEach(zone => {
      const area = (zone.width * zone.height) / 1000000; // m²

      switch (zone.type) {
        case 'unusable_column':
          columnsArea += area;
          break;
        case 'unusable_aisle':
          aislesArea += area;
          break;
        case 'unusable_clearance':
          clearanceArea += area;
          break;
        case 'usable':
          usableArea += area;
          break;
      }
    });

    const unusableArea = columnsArea + aislesArea + clearanceArea;
    const utilization = totalArea > 0 ? (usableArea / totalArea) * 100 : 0;

    // Update UI
    if (this.elements.totalArea) this.elements.totalArea.textContent = `${totalArea.toFixed(2)} m²`;
    if (this.elements.unusableArea) this.elements.unusableArea.textContent = `${unusableArea.toFixed(2)} m²`;
    if (this.elements.usableArea) this.elements.usableArea.textContent = `${usableArea.toFixed(2)} m²`;
    if (this.elements.utilization) this.elements.utilization.textContent = `${utilization.toFixed(1)}%`;
    if (this.elements.columnsArea) this.elements.columnsArea.textContent = `${columnsArea.toFixed(2)} m²`;
    if (this.elements.aislesArea) this.elements.aislesArea.textContent = `${aislesArea.toFixed(2)} m²`;
    if (this.elements.clearanceArea) this.elements.clearanceArea.textContent = `${clearanceArea.toFixed(2)} m²`;
  },

  updateUsableBlocksList() {
    if (!this.elements.usableBlocksList) return;

    const usableZones = this.state.zones.filter(z => z.type === 'usable');

    if (usableZones.length === 0) {
      this.elements.usableBlocksList.innerHTML = '<p class="empty-state">尚未生成空間</p>';
      return;
    }

    let html = '';
    usableZones.forEach(zone => {
      const area = (zone.width * zone.height) / 1000000;
      html += `
        <div class="block-card">
          <div class="block-label">${zone.label || zone.id}</div>
          <div class="block-area">${area.toFixed(2)} m²</div>
        </div>
      `;
    });

    this.elements.usableBlocksList.innerHTML = html;
  },

  resetConstraints() {
    // Reset to defaults
    this.state.constraints = {
      building: {
        columns: {
          mode: 'rule_based',
          columnWidth: 400,
          columnDepth: 400,
          spacingX: 6000,
          spacingZ: 6000,
          wallOffset: 500,
          customColumns: []
        },
        wallClearance: 300
      },
      circulation: {
        mainAisle: {
          enabled: true,
          width: 2000,
          direction: 'along_length',
          position: 'center'
        },
        forkliftAisles: {
          enabled: false,
          count: 2,
          width: 1500,
          spacing: 'auto'
        }
      }
    };

    this.state.zones = [];
    this.syncConstraintsToUI();
    this.updateStatistics();
    this.updateUsableBlocksList();
    this.requestRender();
  },

  async saveSpaces() {
    try {
      // Save layout plan metadata
      localStorage.setItem('layoutPlan', JSON.stringify(this.state.layoutPlan));

      // Save constraints
      localStorage.setItem('spaceConstraints', JSON.stringify(this.state.constraints));

      // Save generated zones (with full YAML-compliant structure)
      localStorage.setItem('generatedZones', JSON.stringify(this.state.zones));

      // Separate usable regions for easy access by assignment page
      const usableRegions = this.state.zones.filter(z => z.type === 'usable');
      localStorage.setItem('usableRegions', JSON.stringify(usableRegions));

      // Separate constraint zones
      const constraintZones = this.state.zones.filter(z => z.type !== 'usable');
      localStorage.setItem('constraintZones', JSON.stringify(constraintZones));

      console.log('[SpacePlanning] Saved to localStorage:');
      console.log('  - Layout plan:', this.state.layoutPlan.layout_id);
      console.log('  - Total zones:', this.state.zones.length);
      console.log('  - Usable regions:', usableRegions.length);
      console.log('  - Constraint zones:', constraintZones.length);

      // Save to API (disabled for now)
      const payload = {
        layout_plan: this.state.layoutPlan,
        container: this.state.containerConfig,
        constraints: this.state.constraints,
        zones: this.state.zones,
        usable_regions: usableRegions,
        constraint_zones: constraintZones
      };

      // TODO: Implement backend API endpoint
      // Temporarily disabled to avoid CORS errors
      /*
      const response = await fetch(`${API_BASE_URL}/api/v2/space-planning/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn('API save failed, but saved to localStorage');
      }
      */

      alert('✓ 空間規劃已儲存到本地！');
    } catch (error) {
      console.error('Save error:', error);
      alert('❌ 儲存失敗：' + error.message);
    }
  },

  // ============================================================
  // RENDERING
  // ============================================================

  requestRender() {
    if (this.renderRequested) return;
    this.renderRequested = true;
    requestAnimationFrame(() => {
      this.redraw();
      this.renderRequested = false;
    });
  },

  // ============================================================
  // Modal Controls
  // ============================================================

  openExpandedView() {
    if (!this.elements.canvasModal || !this.elements.canvasExpanded) return;

    console.log('[SpacePlanning] Opening expanded view');

    // Hide sidebar and app-container
    const sidebar = document.getElementById('controls');
    const appContainer = document.getElementById('app-container');
    if (sidebar) {
      sidebar.style.display = 'none';
      console.log('[SpacePlanning] Hid sidebar');
    }
    if (appContainer) {
      appContainer.style.display = 'none';
      console.log('[SpacePlanning] Hid app-container');
    }

    // Show modal
    this.elements.canvasModal.style.display = 'flex';

    // Wait for modal to render, then calculate size
    setTimeout(() => {
      const modalBody = this.elements.canvasModal.querySelector('.modal-body');

      // Use window dimensions for maximum size
      const maxWidth = window.innerWidth - 20;
      const maxHeight = window.innerHeight - 100; // Reserve space for header/footer

      console.log(`[SpacePlanning] Available space: ${maxWidth}x${maxHeight}`);

      // Calculate aspect ratio
      const bounds = this.getContainerBounds();
      const containerWidth = bounds.maxX - bounds.minX;
      const containerHeight = bounds.maxZ - bounds.minZ;
      const aspectRatio = containerWidth / containerHeight;

      let canvasWidth = maxWidth;
      let canvasHeight = maxWidth / aspectRatio;

      if (canvasHeight > maxHeight) {
        canvasHeight = maxHeight;
        canvasWidth = maxHeight * aspectRatio;
      }

      this.elements.canvasExpanded.width = canvasWidth;
      this.elements.canvasExpanded.height = canvasHeight;

      console.log(`[SpacePlanning] Expanded canvas size: ${canvasWidth}x${canvasHeight}`);

      // Redraw on expanded canvas
      this.redrawExpanded();
    }, 50);
  },

  exitSecondaryEditMode() {
    console.log('[SpacePlanning] Exiting secondary edit mode...');

    // Hide subdivision toolbar
    const subdivisionToolbar = document.getElementById('subdivision-toolbar');
    if (subdivisionToolbar) {
      subdivisionToolbar.style.display = 'none';
      console.log('[SpacePlanning] Hidden subdivision toolbar');
    }

    // Show normal panels (use class selector, not ID)
    const configPanel = document.querySelector('.constraints-panel');
    if (configPanel) {
      configPanel.style.display = 'block';
      console.log('[SpacePlanning] Showed constraints panel');
    }

    // Hide secondary regions panel, show results panel
    const secondaryRegionsPanel = document.getElementById('secondary-regions-panel');
    if (secondaryRegionsPanel) {
      secondaryRegionsPanel.style.display = 'none';
    }

    const resultsPanel = document.querySelector('.results-panel');
    if (resultsPanel) {
      resultsPanel.style.display = 'block';
      console.log('[SpacePlanning] Showed results panel');

      // Show Statistics Section
      const statsSection = document.getElementById('statistics-section');
      if (statsSection) statsSection.style.display = 'block';

      // Hide Usable Blocks Section in normal mode
      const blocksSection = document.getElementById('usable-blocks-section');
      if (blocksSection) blocksSection.style.display = 'none';
    }

    // Show/hide footer buttons
    const normalButtons = document.getElementById('normal-mode-buttons');
    const editButtons = document.getElementById('edit-mode-buttons');
    if (normalButtons) normalButtons.style.display = 'flex';
    if (editButtons) editButtons.style.display = 'none';

    // Restore header text
    const header = document.querySelector('.page-header h2');
    if (header) {
      header.textContent = '空間規劃 & 限制設定';
    }

    // Show generate/reset buttons
    const btnGenerate = document.getElementById('btn-generate');
    const btnReset = document.getElementById('btn-reset');
    if (btnGenerate) btnGenerate.style.display = 'inline-block';
    if (btnReset) btnReset.style.display = 'inline-block';

    // Redraw canvas and update UI to restore proper layout
    // Use setTimeout to ensure UI has updated before redrawing
    console.log('[SpacePlanning] Scheduling canvas redraw after exiting edit mode...');
    setTimeout(() => {
      console.log('[SpacePlanning] Redrawing canvas now...');
      this.redraw();

      // Update statistics and usable blocks list
      console.log('[SpacePlanning] Updating UI after exit...');
      this.updateStatistics();
      this.updateUsableBlocksList();
    }, 100);
  },

  closeExpandedView() {
    if (!this.elements.canvasModal) return;

    console.log('[SpacePlanning] Closing expanded view');
    this.elements.canvasModal.style.display = 'none';

    // Restore sidebar and app-container
    const sidebar = document.getElementById('controls');
    const appContainer = document.getElementById('app-container');
    if (sidebar) {
      sidebar.style.display = '';
      console.log('[SpacePlanning] Restored sidebar');
    }
    if (appContainer) {
      appContainer.style.display = '';
      console.log('[SpacePlanning] Restored app-container');
    }
  },

  redrawExpanded() {
    const ctx = this.elements.ctxExpanded;
    const canvas = this.elements.canvasExpanded;
    if (!ctx || !canvas) return;

    console.log('[SpacePlanning] Redrawing expanded canvas');

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Temporarily swap canvas context
    const originalCanvas = this.elements.canvas;
    const originalCtx = this.elements.ctx;

    this.elements.canvas = canvas;
    this.elements.ctx = ctx;

    // Draw everything
    this.drawGrid();
    this.drawContainer();

    const layerMap = {
      'unusable_clearance': 'clearance',
      'unusable_aisle': 'aisles',
      'usable': 'usable',
      'unusable_column': 'columns'
    };

    const zoneTypes = ['unusable_clearance', 'unusable_aisle', 'usable', 'unusable_column'];

    zoneTypes.forEach(type => {
      const layerKey = layerMap[type];
      const isVisible = this.state.layerVisibility[layerKey];

      if (!isVisible) return;

      const zonesToDraw = this.state.zones.filter(z => z.type === type);
      zonesToDraw.forEach(zone => this.drawZone(zone));
    });

    // Restore original canvas
    this.elements.canvas = originalCanvas;
    this.elements.ctx = originalCtx;

    console.log('[SpacePlanning] Expanded canvas redraw complete');
  },

  resizeCanvas() {
    const canvas = this.elements.canvas;
    if (!canvas) return;

    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width;
    canvas.height = rect.height - 100; // Account for controls and legend

    this.requestRender();
  },

  redraw() {
    const ctx = this.elements.ctx;
    const canvas = this.elements.canvas;
    if (!ctx || !canvas) {
      console.warn('[SpacePlanning] Cannot redraw: missing ctx or canvas');
      return;
    }

    console.log('[SpacePlanning] Redrawing canvas...');
    console.log('[SpacePlanning] Total zones:', this.state.zones.length);
    console.log('[SpacePlanning] Layer visibility:', this.state.layerVisibility);

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    this.drawGrid();

    // Draw container outline
    this.drawContainer();

    // Draw zones by type - 柱子最後畫（在最上層）
    // 修正：使用正確的圖層映射
    const layerMap = {
      'unusable_clearance': 'clearance',
      'unusable_aisle': 'aisles',      // 注意複數
      'usable': 'usable',
      'unusable_column': 'columns'     // 注意複數
    };

    const zoneTypes = ['unusable_clearance', 'unusable_aisle', 'usable', 'unusable_column'];

    zoneTypes.forEach(type => {
      const layerKey = layerMap[type];
      const isVisible = this.state.layerVisibility[layerKey];

      console.log(`[SpacePlanning] Rendering layer ${type} (${layerKey}), visible: ${isVisible}`);

      if (!isVisible) return;

      const zonesToDraw = this.state.zones.filter(z => z.type === type);
      console.log(`[SpacePlanning] Drawing ${zonesToDraw.length} zones of type ${type}`);

      zonesToDraw.forEach(zone => this.drawZone(zone));
    });

    console.log('[SpacePlanning] Redraw complete');
  },

  drawGrid() {
    const ctx = this.elements.ctx;
    const canvas = this.elements.canvas;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    const gridSize = 50;

    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  },

  drawContainer() {
    const config = this.state.containerConfig;
    if (!config) return;

    const ctx = this.elements.ctx;
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    if (config.shape === 'rect') {
      const rect = this.worldToCanvas(0, 0, config.widthX, config.depthZ);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
    // TODO: Draw T and U shapes

    ctx.setLineDash([]);
  },

  drawZone(zone) {
    const ctx = this.elements.ctx;

    const styles = {
      unusable_column: { fill: '#6b7280', stroke: '#4b5563' },  // 改回灰色
      unusable_aisle: { fill: '#9ca3af', stroke: '#6b7280' },
      unusable_clearance: { fill: '#d1d5db', stroke: '#9ca3af' },
      usable: { fill: '#3b82f6', stroke: '#2563eb' }
    };

    const style = styles[zone.type] || { fill: '#64748b', stroke: '#475569' };

    const rect = this.worldToCanvas(
      zone.x - zone.width / 2,
      zone.y - zone.height / 2,
      zone.width,
      zone.height
    );

    console.log(`[SpacePlanning] Drawing zone ${zone.type} at canvas (${Math.round(rect.x)}, ${Math.round(rect.y)}) size ${Math.round(rect.width)}x${Math.round(rect.height)}`);

    // Fill
    ctx.fillStyle = style.fill;
    ctx.globalAlpha = zone.type === 'unusable_column' ? 0.8 : 0.4;  // 柱子更不透明
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    // Stroke
    ctx.globalAlpha = 1;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = zone.type === 'unusable_column' ? 3 : 2;  // 柱子邊框更粗
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    // Label
    if (zone.label || zone.metadata?.reason) {
      ctx.fillStyle = zone.type === 'unusable_column' ? '#ffffff' : '#f1f5f9';
      ctx.font = zone.type === 'unusable_column' ? 'bold 14px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        zone.label || zone.metadata.reason,
        rect.x + rect.width / 2,
        rect.y + rect.height / 2
      );
    }
  },

  worldToCanvas(worldX, worldY, worldW, worldH) {
    const canvas = this.elements.canvas;
    const config = this.state.containerConfig;
    if (!canvas || !config) return { x: 0, y: 0, width: 0, height: 0 };

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
      y: worldY * scale + offsetY,
      width: worldW * scale,
      height: worldH * scale
    };
  },

  // ============================================================
  // SECONDARY EDITING MODE
  // ============================================================

  enterSecondaryEditMode() {
    console.log('[SpacePlanning] Entering secondary edit mode...');

    // Check if we have usable regions
    const usableRegions = this.state.zones.filter(z => z.type === 'usable');
    if (usableRegions.length === 0) {
      alert('請先生成可用空間');
      return;
    }

    // Hide constraints panel, show subdivision toolbar
    const constraintsPanel = document.querySelector('.constraints-panel');
    const subdivisionToolbar = document.getElementById('subdivision-toolbar');
    const resultsPanel = document.querySelector('.results-panel');

    if (constraintsPanel) constraintsPanel.style.display = 'none';
    if (subdivisionToolbar) subdivisionToolbar.style.display = 'block';

    // Show results panel but hide statistics/blocks inside (secondary-regions-panel is also inside)
    if (resultsPanel) {
      resultsPanel.style.display = 'block';

      // Hide Statistics Section
      const statsSection = document.getElementById('statistics-section');
      if (statsSection) statsSection.style.display = 'none';

      // Hide Usable Blocks Section
      const blocksSection = document.getElementById('usable-blocks-section');
      if (blocksSection) blocksSection.style.display = 'none';
    }

    // Switch button groups
    const normalButtons = document.getElementById('normal-mode-buttons');
    const editButtons = document.getElementById('edit-mode-buttons');

    if (normalButtons) normalButtons.style.display = 'none';
    if (editButtons) editButtons.style.display = 'flex';

    // Update header
    const header = document.querySelector('.page-header h2');
    if (header) {
      header.textContent = '進一步規劃空間';
    }

    // Hide generate/reset buttons
    const btnGenerate = document.getElementById('btn-generate');
    const btnReset = document.getElementById('btn-reset');
    if (btnGenerate) btnGenerate.style.display = 'none';
    if (btnReset) btnReset.style.display = 'none';

    // Initialize secondary editor
    if (window.SecondaryRegionEditor) {
      window.SecondaryRegionEditor.init();
      window.SecondaryRegionEditor.state.mode = 'editing';
      window.SecondaryRegionEditor.renderCanvas();
    }

    console.log('[SpacePlanning] Secondary edit mode activated');
  }
};

// Expose to global scope for HTML onclick handlers
window.SpacePlanning = SpacePlanningPage;