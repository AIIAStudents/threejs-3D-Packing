
// Space Planning Page - Constraint-Based Generation
// Replaces manual drawing with automatic space generation

import { spacePlanningPersistenceService } from '../../frontend/contexts/space-design/application/space-planning-persistence-service.js';
import { spaceDesignStorage } from '../../frontend/contexts/space-design/infrastructure/space-design-storage.js';
import { secondaryRegionEditorBridge } from '../../frontend/contexts/space-design/infrastructure/secondary-region-editor-bridge.js';
import {
  buildWarehouseLayoutPlan,
  getContainerBounds as plannerGetContainerBounds,
  getFootprintOutlinePoints,
  isPointInWarehouseShape,
  normalizeWarehouseContainerConfig
} from '../../frontend/contexts/space-design/domain/warehouse-layout-planner.js';

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
    },

    readOnlyMode: false,
    readOnlyContext: null
  },

  elements: {},
  isInitialized: false,
  renderRequested: false,

  async init() {
    this.bindDOM();
    this.addEventListeners();

    // Fix 3: Always disconnect old observer and re-observe on every init()
    // (SPA routing calls init() each time, but isInitialized stays true)
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (!this.isInitialized) {
      // Store the bound function so we can remove it later if needed
      this._handleWindowResize = () => {
        this.resizeCanvas();
        this.requestRender();
      };
      window.addEventListener('resize', this._handleWindowResize);
      this.isInitialized = true;
    }

    // Re-create ResizeObserver every init so it observes the current canvas parent
    if (this.elements.canvas && this.elements.canvas.parentElement) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this.resizeCanvas()) {
          this.requestRender();
        }
      });
      this._resizeObserver.observe(this.elements.canvas.parentElement);
    }

    // Move modal to body level to ensure it can cover sidebar
    if (this.elements.canvasModal && this.elements.canvasModal.parentElement) {
      document.body.appendChild(this.elements.canvasModal);
    }

    await this.loadData();

    // Fix 4: Double rAF — browser needs two frames to complete SPA layout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.resizeCanvas()) {
          this.requestRender();
        }
      });
    });
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
    this.elements.usableBlocksList = document.getElementById('zones-list');
    this.elements.scoreTotal = document.getElementById('score-total');
    this.elements.storageRatio = document.getElementById('storage-ratio');
    this.elements.aisleRatio = document.getElementById('aisle-ratio');
    this.elements.accessibilityRatio = document.getElementById('accessibility-ratio');
    this.elements.deadCornerRatio = document.getElementById('dead-corner-ratio');
    this.elements.pickDistance = document.getElementById('pick-distance');
    this.elements.storageZoneCount = document.getElementById('storage-zone-count');
    this.elements.aisleBalanceScore = document.getElementById('aisle-balance-score');
    this.elements.pickingScore = document.getElementById('picking-score');
    this.elements.slottingScore = document.getElementById('slotting-score');

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
        if (this.state.readOnlyMode) {
          event.preventDefault();
          event.stopPropagation();
          window.location.hash = '/planning-v2';
          return;
        }

        // Check if edit mode buttons are visible to determine mode
        const editButtons = document.getElementById('edit-mode-buttons');
        const isInEditMode = editButtons && editButtons.style.display !== 'none';

        if (isInEditMode) {
          // In edit mode - exit to normal mode (STAY on same page)
          event.preventDefault();
          event.stopPropagation();

          secondaryRegionEditorBridge.exitEditMode();

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
    this.state.readOnlyContext = spaceDesignStorage.loadReadOnlyCutContext();
    this.state.readOnlyMode = Boolean(this.state.readOnlyContext?.enabled);

    const initialState = spacePlanningPersistenceService.loadInitialState(this.state.constraints);
    this.state.containerConfig = initialState.containerConfig
      ? normalizeWarehouseContainerConfig(initialState.containerConfig)
      : null;

    const derivedConstraints = this.createConstraintStateFromConfig(this.state.containerConfig);
    this.state.constraints = initialState.hasSavedConstraints
      ? this.mergeConstraintState(derivedConstraints, initialState.constraints)
      : derivedConstraints;

    if (this.state.containerConfig) {
      console.log('[SpacePlanning] Loaded container config:', this.state.containerConfig);
    }
    this.syncConstraintsToUI();
    if (initialState.hasSavedConstraints) {
      console.log('[SpacePlanning] Loaded saved constraints');
    }
    if (this.state.readOnlyMode) {
      this.state.layoutPlan = spaceDesignStorage.loadLayoutPlan() || this.state.layoutPlan;
      this.state.zones = spaceDesignStorage.loadGeneratedZones() || [];
      this.updateStatistics();
      this.updateUsableBlocksList();
      this.applyReadOnlyMode();
      this.requestRender();
      return;
    }

    // Always start with clean zones — never restore stale data from previous session/shape
    this.state.zones = [];
    spacePlanningPersistenceService.clearGeneratedZones();
  },

  createConstraintStateFromConfig(containerConfig) {
    const normalized = containerConfig
      ? normalizeWarehouseContainerConfig(containerConfig)
      : null;
    const planning = normalized?.planning || {};
    const mainAisleOffsetRatio = planning.mainAisleOffsetRatio ?? 0.5;

    let mainAislePosition = 'center';
    if (mainAisleOffsetRatio <= 0.42) {
      mainAislePosition = 'offset_left';
    } else if (mainAisleOffsetRatio >= 0.58) {
      mainAislePosition = 'offset_right';
    }

    return {
      building: {
        columns: {
          mode: 'rule_based',
          columnWidth: 400,
          columnDepth: 400,
          spacingX: planning.targetStorageBand || 6000,
          spacingZ: planning.targetStorageBand || 6000,
          wallOffset: Math.max(300, planning.safetyBuffer || 300),
          customColumns: []
        },
        wallClearance: planning.safetyBuffer ?? 300
      },
      circulation: {
        mainAisle: {
          enabled: planning.preserveCentralMainAisle ?? true,
          width: planning.primaryAisleWidth ?? 2400,
          direction: planning.mainAisleAxis === 'vertical' ? 'along_width' : 'along_length',
          position: mainAislePosition
        },
        forkliftAisles: {
          enabled: (planning.secondaryAisleWidth ?? 0) > 0,
          count: 2,
          width: planning.secondaryAisleWidth ?? 1600,
          spacing: 'auto'
        }
      }
    };
  },

  mergeConstraintState(baseState, savedState = {}) {
    return {
      building: {
        ...baseState.building,
        ...(savedState.building || {}),
        columns: {
          ...baseState.building.columns,
          ...((savedState.building && savedState.building.columns) || {})
        }
      },
      circulation: {
        ...baseState.circulation,
        ...(savedState.circulation || {}),
        mainAisle: {
          ...baseState.circulation.mainAisle,
          ...((savedState.circulation && savedState.circulation.mainAisle) || {})
        },
        forkliftAisles: {
          ...baseState.circulation.forkliftAisles,
          ...((savedState.circulation && savedState.circulation.forkliftAisles) || {})
        }
      }
    };
  },

  syncConstraintsToUI() {
    const c = this.state.constraints;

    // Building constraints
    if (this.elements.columnMode) this.elements.columnMode.value = c.building.columns.mode;
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
    if (this.elements.forkliftSpacing) this.elements.forkliftSpacing.value = c.circulation.forkliftAisles.spacing;

    const ruleParams = document.getElementById('rule-based-params');
    const exceptionParams = document.getElementById('exception-based-params');
    if (ruleParams && exceptionParams) {
      const ruleBased = c.building.columns.mode === 'rule_based';
      ruleParams.style.display = ruleBased ? 'block' : 'none';
      exceptionParams.style.display = ruleBased ? 'none' : 'block';
    }

    const mainAisleParams = document.getElementById('main-aisle-params');
    if (mainAisleParams) {
      mainAisleParams.style.display = c.circulation.mainAisle.enabled ? 'block' : 'none';
    }

    const forkliftParams = document.getElementById('forklift-aisles-params');
    if (forkliftParams) {
      forkliftParams.style.display = c.circulation.forkliftAisles.enabled ? 'block' : 'none';
    }

    this.updateCustomColumnsList();
  },

  applyReadOnlyMode() {
    const banner = document.getElementById('cut-container-readonly-banner');
    if (banner) {
      banner.hidden = false;
    }

    document.querySelectorAll(
      '.constraints-panel input, .constraints-panel select, .constraints-panel textarea, .constraints-panel button'
    ).forEach((element) => {
      element.disabled = true;
    });

    const idsToHide = [
      'btn-generate',
      'btn-reset',
      'btn-save',
      'btn-next-step',
      'btn-add-column',
      'subdivision-toolbar',
      'normal-mode-buttons',
      'edit-mode-buttons'
    ];

    idsToHide.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = 'none';
      }
    });

    if (this.elements.btnPrevStep) {
      this.elements.btnPrevStep.textContent = '回到快速模式';
    }

    const pageTitle = document.querySelector('.page-header h2');
    if (pageTitle) {
      pageTitle.textContent = '空間切割詳情';
    }
  },

  addCustomColumn() {
    if (this.state.readOnlyMode) return;
    // Show modal instead of prompt
    const modal = document.getElementById('column-modal');
    if (modal) {
      modal.classList.add('active');
    }
  },

  submitCustomColumn(e) {
    if (this.state.readOnlyMode) return;
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
    if (this.state.readOnlyMode) return;
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
    c.circulation.forkliftAisles.spacing = this.elements.forkliftSpacing?.value || 'auto';
  },

  getEffectivePlanningConfig() {
    const baseConfig = normalizeWarehouseContainerConfig(this.state.containerConfig || {});
    const planning = {
      ...(baseConfig.planning || {})
    };
    const { building, circulation } = this.state.constraints;

    const positionRatioMap = {
      center: 0.5,
      offset_left: 0.34,
      offset_right: 0.66
    };

    planning.safetyBuffer = building.wallClearance;
    planning.primaryAisleWidth = circulation.mainAisle.width || planning.primaryAisleWidth;
    planning.secondaryAisleWidth = circulation.forkliftAisles.enabled
      ? (circulation.forkliftAisles.width || planning.secondaryAisleWidth)
      : 0;
    planning.preserveCentralMainAisle = circulation.mainAisle.enabled;
    planning.mainAisleAxis = circulation.mainAisle.direction || planning.mainAisleAxis;
    planning.mainAisleOffsetRatio = positionRatioMap[circulation.mainAisle.position] || 0.5;
    planning.targetStorageBand = building.columns.spacingX || planning.targetStorageBand;

    return normalizeWarehouseContainerConfig({
      ...baseConfig,
      planning
    });
  },

  // ============================================================
  // SPACE GENERATION LOGIC
  // ============================================================

  generateSpaces() {
    if (this.state.readOnlyMode) return;
    if (!this.state.containerConfig) {
      alert('請先定義容器尺寸');
      return;
    }

    console.log('[SpacePlanning] ========== Generating spaces ==========');
    console.log('[SpacePlanning] Container config:', this.state.containerConfig);

    // Read current constraints from UI
    this.readConstraintsFromUI();
    console.log('[SpacePlanning] Constraints:', this.state.constraints);

    const effectiveConfig = this.getEffectivePlanningConfig();
    const layout = buildWarehouseLayoutPlan(effectiveConfig, this.state.constraints);

    this.state.containerConfig = layout.containerConfig;
    this.state.zones = layout.zones;
    this.state.layoutPlan = {
      layout_id: `layout_${Date.now()}`,
      source: {
        columns_enabled: this.state.constraints.building.columns.mode !== 'none',
        aisles_enabled: layout.zones.some(zone => zone.zoneCategory === 'accessible_path'),
        safety_margin_enabled: layout.zones.some(zone => zone.zoneCategory === 'safety_buffer'),
        usable_area_ratio: layout.metrics.storageUtilization
      },
      planning: layout.planning,
      metrics: layout.metrics,
      evaluation: layout.evaluation,
      search: layout.search,
      generated_at: new Date().toISOString()
    };

    console.log('[SpacePlanning] Planning metrics:', layout.metrics);
    console.log('[SpacePlanning] Evaluation:', layout.evaluation);
    console.log('[SpacePlanning] Search frontier:', layout.search);
    console.log('[SpacePlanning] Zones by type:', {
      usable: this.state.zones.filter(z => z.type === 'usable').length,
      aisles: this.state.zones.filter(z => z.zoneCategory === 'accessible_path').length,
      buffers: this.state.zones.filter(z => z.zoneCategory === 'safety_buffer').length,
      blocked: this.state.zones.filter(z => z.zoneCategory === 'blocked_area').length
    });

    // Update UI
    this.updateStatistics();
    this.updateUsableBlocksList();
    const blocksSection = document.getElementById('usable-blocks-section');
    if (blocksSection) {
      blocksSection.style.display = 'block';
    }
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
      });
    }
    else if (config.shape === 't_shape') {
      const topW = config.t_top_x || config.widthX;
      const topD = config.t_top_z || (config.depthZ * 0.4);
      const botW = config.t_bottom_x || (config.widthX * 0.4);
      const botD = config.t_bottom_z || (config.depthZ * 0.6);
      const botLeft = (topW - botW) / 2;
      const hY = config.heightY || 2400;

      // 1. 莖部底端（底牆）— 寬度是莖部 botW
      this.state.zones.push({
        id: 'clearance_stem_bottom', type: 'unusable_clearance',
        x: topW / 2, y: clearance / 2,
        width: botW, height: clearance, depth: hY,
        metadata: { reason: '牆邊安全距 (下)' }
      });

      // 2. 橫桿頂端（頂牆）— 全寬 topW
      this.state.zones.push({
        id: 'clearance_cross_top', type: 'unusable_clearance',
        x: topW / 2, y: botD + topD - clearance / 2,
        width: topW, height: clearance, depth: hY,
        metadata: { reason: '牆邊安全距 (上)' }
      });

      // 3. 橫桿左牆 — 僅橫桿段高度 topD
      this.state.zones.push({
        id: 'clearance_cross_left', type: 'unusable_clearance',
        x: clearance / 2, y: botD + topD / 2,
        width: clearance, height: topD, depth: hY,
        metadata: { reason: '牆邊安全距 (橫桿左)' }
      });

      // 4. 橫桿右牆 — 僅橫桿段高度 topD
      this.state.zones.push({
        id: 'clearance_cross_right', type: 'unusable_clearance',
        x: topW - clearance / 2, y: botD + topD / 2,
        width: clearance, height: topD, depth: hY,
        metadata: { reason: '牆邊安全距 (橫桿右)' }
      });

      // 5. 莖部左牆 — 莖部段高度 botD，貼莖部左邊
      this.state.zones.push({
        id: 'clearance_stem_left', type: 'unusable_clearance',
        x: botLeft + clearance / 2, y: botD / 2,
        width: clearance, height: botD, depth: hY,
        metadata: { reason: '牆邊安全距 (莖部左)' }
      });

      // 6. 莖部右牆 — 莖部段高度 botD，貼莖部右邊
      this.state.zones.push({
        id: 'clearance_stem_right', type: 'unusable_clearance',
        x: botLeft + botW - clearance / 2, y: botD / 2,
        width: clearance, height: botD, depth: hY,
        metadata: { reason: '牆邊安全距 (莖部右)' }
      });
    }
    else if (config.shape === 'u_shape') {
      const outerW = config.u_outer_x || config.widthX;
      const outerD = config.u_outer_z || config.depthZ;
      const gapW = config.u_gap_x || config.gapWidthX || (outerW * 0.4);
      const gapD = config.u_gap_z || config.gapDepthZ || (outerD * 0.5);
      const gapLeft = (outerW - gapW) / 2;
      const gapRight = gapLeft + gapW;
      const hY = config.heightY || 2400;

      // 1. 底牆 — 全寬
      this.state.zones.push({
        id: 'clearance_bottom', type: 'unusable_clearance',
        x: outerW / 2, y: clearance / 2,
        width: outerW, height: clearance, depth: hY,
        metadata: { reason: '牆邊安全距 (下)' }
      });

      // 2. 左外牆 — 全高 outerD
      this.state.zones.push({
        id: 'clearance_left', type: 'unusable_clearance',
        x: clearance / 2, y: outerD / 2,
        width: clearance, height: outerD, depth: hY,
        metadata: { reason: '牆邊安全距 (左)' }
      });

      // 3. 右外牆 — 全高 outerD
      this.state.zones.push({
        id: 'clearance_right', type: 'unusable_clearance',
        x: outerW - clearance / 2, y: outerD / 2,
        width: clearance, height: outerD, depth: hY,
        metadata: { reason: '牆邊安全距 (右)' }
      });

      // 4. 左臂頂端（gap 左側）— 僅左臂寬 gapLeft
      this.state.zones.push({
        id: 'clearance_left_arm_top', type: 'unusable_clearance',
        x: gapLeft / 2, y: outerD - clearance / 2,
        width: gapLeft, height: clearance, depth: hY,
        metadata: { reason: '牆邊安全距 (左臂上)' }
      });

      // 5. 右臂頂端（gap 右側）— 僅右臂寬 (outerW - gapRight)
      this.state.zones.push({
        id: 'clearance_right_arm_top', type: 'unusable_clearance',
        x: (gapRight + outerW) / 2, y: outerD - clearance / 2,
        width: outerW - gapRight, height: clearance, depth: hY,
        metadata: { reason: '牆邊安全距 (右臂上)' }
      });

      // 6. 缺口左內壁 — 高度 gapD，貼缺口左側
      this.state.zones.push({
        id: 'clearance_gap_left_wall', type: 'unusable_clearance',
        x: gapLeft + clearance / 2, y: outerD - gapD / 2,
        width: clearance, height: gapD, depth: hY,
        metadata: { reason: '牆邊安全距 (缺口左)' }
      });

      // 7. 缺口右內壁 — 高度 gapD，貼缺口右側
      this.state.zones.push({
        id: 'clearance_gap_right_wall', type: 'unusable_clearance',
        x: gapRight - clearance / 2, y: outerD - gapD / 2,
        width: clearance, height: gapD, depth: hY,
        metadata: { reason: '牆邊安全距 (缺口右)' }
      });
    }
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
    else if (config.shape === 't_shape' || config.shape === 'u_shape') {
      console.log('[SpacePlanning] Aisle generation for', config.shape, 'not yet implemented');
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

    else if (config.shape === 't_shape') {
      const topW = config.t_top_x || config.widthX;
      const topD = config.t_top_z || (config.depthZ * 0.4);
      const botW = config.t_bottom_x || (config.widthX * 0.4);
      const botD = config.t_bottom_z || (config.depthZ * 0.6);
      const botLeft = (topW - botW) / 2;
      const c = this.state.constraints.building.wallClearance || 0;
      const hY = config.heightY || 2400;

      // Cross-bar: from y=botD (no clearance — junction with stem) to y=botD+topD-c (top clearance)
      const crossW = topW - 2 * c;
      const crossH = topD - c;
      if (crossW > 0 && crossH > 0) {
        this.state.zones.push({
          id: 'usable_crossbar', type: 'usable', name: '橫桿區', label: '橫桿區',
          x: topW / 2,
          y: botD + crossH / 2,          // from botD upward, no bottom clearance
          width: crossW, height: crossH, depth: hY,
          area: Math.round((crossW * crossH) / 1000000 * 100) / 100,
          metadata: { reason: '可規劃空間' }
        });
      }

      // Stem: from y=c (bottom clearance) to y=botD (no top clearance — junction with crossbar)
      const stemW = botW - 2 * c;
      const stemH = botD - c;
      if (stemW > 0 && stemH > 0) {
        this.state.zones.push({
          id: 'usable_stem', type: 'usable', name: '莖部區', label: '莖部區',
          x: botLeft + botW / 2,         // actual stem center X
          y: c + stemH / 2,              // from bottom clearance upward
          width: stemW, height: stemH, depth: hY,
          area: Math.round((stemW * stemH) / 1000000 * 100) / 100,
          metadata: { reason: '可規劃空間' }
        });
      }
    }

    else if (config.shape === 'u_shape') {
      const outerW = config.u_outer_x || config.widthX;
      const outerD = config.u_outer_z || config.depthZ;
      const gapW = config.u_gap_x || config.gapWidthX || (outerW * 0.4);
      const gapD = config.u_gap_z || config.gapDepthZ || (outerD * 0.5);
      const c = this.state.constraints.building.wallClearance || 0;
      const hY = config.heightY || 2400;
      const gapLeft = (outerW - gapW) / 2;
      const gapRight = gapLeft + gapW;
      const gapTop = outerD - gapD;

      // Left arm: full height, x=[c .. gapLeft-c]
      const leftW = gapLeft - 2 * c;
      const leftH = outerD - 2 * c;          // full container height
      if (leftW > 0 && leftH > 0) {
        this.state.zones.push({
          id: 'usable_left_arm', type: 'usable', name: '左臂區', label: '左臂區',
          x: c + leftW / 2,
          y: c + leftH / 2,                  // from bottom clearance
          width: leftW, height: leftH, depth: hY,
          area: Math.round((leftW * leftH) / 1000000 * 100) / 100,
          metadata: { reason: '可規劃空間' }
        });
      }

      // Right arm: full height, x=[gapRight+c .. outerW-c]
      const rightW = (outerW - gapRight) - 2 * c;
      const rightH = outerD - 2 * c;
      if (rightW > 0 && rightH > 0) {
        this.state.zones.push({
          id: 'usable_right_arm', type: 'usable', name: '右臂區', label: '右臂區',
          x: gapRight + c + rightW / 2,
          y: c + rightH / 2,               // from bottom clearance
          width: rightW, height: rightH, depth: hY,
          area: Math.round((rightW * rightH) / 1000000 * 100) / 100,
          metadata: { reason: '可規劃空間' }
        });
      }

      // Base strip: ONLY middle column (gapW wide) to avoid arm overlap
      const baseW = gapW;
      const baseH = gapTop - 2 * c;
      if (baseW > 0 && baseH > 0) {
        this.state.zones.push({
          id: 'usable_base', type: 'usable', name: '底部區', label: '底部區',
          x: outerW / 2,
          y: c + baseH / 2,              // from bottom clearance upward
          width: baseW, height: baseH, depth: hY,
          area: Math.round((baseW * baseH) / 1000000 * 100) / 100,
          metadata: { reason: '可規劃空間' }
        });
      }
    }
  },

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================

  getContainerBounds() {
    const bounds = plannerGetContainerBounds(this.state.containerConfig || {});
    return {
      minX: bounds.minX,
      minZ: bounds.minZ,
      maxX: bounds.maxX,
      maxZ: bounds.maxZ
    };
  },

  isPointInContainer(x, y) {
    return isPointInWarehouseShape(this.state.containerConfig || {}, x, y);
  },

  // ============================================================
  // UI UPDATE FUNCTIONS
  // ============================================================

  updateStatistics() {
    const metrics = this.state.layoutPlan?.metrics;
    const evaluation = this.state.layoutPlan?.evaluation;

    if (!metrics) {
      if (this.elements.totalArea) this.elements.totalArea.textContent = '0 m²';
      if (this.elements.unusableArea) this.elements.unusableArea.textContent = '0 m²';
      if (this.elements.usableArea) this.elements.usableArea.textContent = '0 m²';
      if (this.elements.utilization) this.elements.utilization.textContent = '0%';
      if (this.elements.columnsArea) this.elements.columnsArea.textContent = '0 m²';
      if (this.elements.aislesArea) this.elements.aislesArea.textContent = '0 m²';
      if (this.elements.clearanceArea) this.elements.clearanceArea.textContent = '0 m²';
      return;
    }

    const unusableArea = metrics.aisleAreaM2 + metrics.safetyAreaM2 + metrics.blockedAreaM2;
    const storageZoneCount = this.state.zones.filter(zone => zone.type === 'usable').length;

    if (this.elements.totalArea) this.elements.totalArea.textContent = `${metrics.totalAreaM2.toFixed(2)} m²`;
    if (this.elements.unusableArea) this.elements.unusableArea.textContent = `${unusableArea.toFixed(2)} m²`;
    if (this.elements.usableArea) this.elements.usableArea.textContent = `${metrics.storageAreaM2.toFixed(2)} m²`;
    if (this.elements.utilization) this.elements.utilization.textContent = `${(metrics.storageUtilization * 100).toFixed(1)}%`;
    if (this.elements.columnsArea) this.elements.columnsArea.textContent = `${metrics.blockedAreaM2.toFixed(2)} m²`;
    if (this.elements.aislesArea) this.elements.aislesArea.textContent = `${metrics.aisleAreaM2.toFixed(2)} m²`;
    if (this.elements.clearanceArea) this.elements.clearanceArea.textContent = `${metrics.safetyAreaM2.toFixed(2)} m²`;

    if (this.elements.scoreTotal) this.elements.scoreTotal.textContent = `${evaluation?.score?.toFixed(1) || '0.0'} 分`;
    if (this.elements.storageRatio) this.elements.storageRatio.textContent = `${(metrics.storageUtilization * 100).toFixed(1)}%`;
    if (this.elements.aisleRatio) this.elements.aisleRatio.textContent = `${(metrics.aisleRatio * 100).toFixed(1)}%`;
    if (this.elements.accessibilityRatio) this.elements.accessibilityRatio.textContent = `${(metrics.accessibilityRatio * 100).toFixed(1)}%`;
    if (this.elements.deadCornerRatio) this.elements.deadCornerRatio.textContent = `${(metrics.deadCornerRatio * 100).toFixed(1)}%`;
    if (this.elements.pickDistance) this.elements.pickDistance.textContent = `${Math.round(metrics.averagePickDistanceMm)} mm`;
    if (this.elements.storageZoneCount) this.elements.storageZoneCount.textContent = `${storageZoneCount} 區`;
    if (this.elements.aisleBalanceScore) this.elements.aisleBalanceScore.textContent = `${((evaluation?.components?.aisleBalance || 0) * 100).toFixed(0)} 分`;
    if (this.elements.pickingScore) this.elements.pickingScore.textContent = `${((evaluation?.components?.pickingEfficiency || 0) * 100).toFixed(0)} 分`;
    if (this.elements.slottingScore) this.elements.slottingScore.textContent = `${((evaluation?.components?.slottingFlexibility || 0) * 100).toFixed(0)} 分`;
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
      const subtypeLabel = zone.subtype === 'storage_band'
        ? '標準儲位帶'
        : zone.subtype || '儲位區';
      html += `
        <div class="block-card">
          <div class="block-label">${zone.label || zone.id}</div>
          <div class="block-meta">${subtypeLabel}</div>
          <div class="block-area">${area.toFixed(2)} m²</div>
        </div>
      `;
    });

    this.elements.usableBlocksList.innerHTML = html;
  },

  resetConstraints() {
    if (this.state.readOnlyMode) return;
    this.state.constraints = this.createConstraintStateFromConfig(this.state.containerConfig);

    this.state.zones = [];
    this.state.layoutPlan = {
      layout_id: null,
      source: {
        columns_enabled: true,
        aisles_enabled: true,
        safety_margin_enabled: true,
        usable_area_ratio: 0
      },
      generated_at: null
    };
    this.syncConstraintsToUI();
    this.updateStatistics();
    this.updateUsableBlocksList();
    this.requestRender();
  },

  async saveSpaces() {
    if (this.state.readOnlyMode) return;
    try {
      const { usableRegions, constraintZones } = spacePlanningPersistenceService.persistGeneratedLayout({
        layoutPlan: this.state.layoutPlan,
        constraints: this.state.constraints,
        zones: this.state.zones,
        containerConfig: this.state.containerConfig
      });

      console.log('[SpacePlanning] Saved generated layout state:');
      console.log('  - Layout plan:', this.state.layoutPlan.layout_id);
      console.log('  - Total zones:', this.state.zones.length);
      console.log('  - Usable regions:', usableRegions.length);
      console.log('  - Constraint zones:', constraintZones.length);

      const result = await spacePlanningPersistenceService.submitCuttingJob(
        this.state.containerConfig,
        usableRegions
      );
      console.log('[SpacePlanning] Backend save successful:', result);
      alert('✓ 空間規劃已儲存成功 (包含伺服器同步)！');

    } catch (error) {
      console.error('[SpacePlanning] Save error:', error);
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

    // Hide sidebar and app-container
    const sidebar = document.getElementById('controls');
    const appContainer = document.getElementById('app-container');
    if (sidebar) sidebar.style.display = 'none';
    if (appContainer) appContainer.style.display = 'none';

    // Show modal
    this.elements.canvasModal.style.display = 'flex';

    // Double rAF: wait for modal layout to complete
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const dpr = window.devicePixelRatio || 1;
        const bounds = this.getContainerBounds();

        // Use window viewport minus safe margins
        const viewportRect = {
          width: window.innerWidth - 40,
          height: window.innerHeight - 120  // header/footer/legend
        };

        const { scale, offsetX, offsetY } = this.computeFitTransform(bounds, viewportRect);
        const bboxW = bounds.maxX - bounds.minX;
        const bboxH = bounds.maxZ - bounds.minZ;

        // Canvas size = exactly the viewport we measured
        const canvasW = viewportRect.width;
        const canvasH = viewportRect.height;

        const expCanvas = this.elements.canvasExpanded;
        expCanvas.width = canvasW * dpr;
        expCanvas.height = canvasH * dpr;
        expCanvas.style.width = canvasW + 'px';
        expCanvas.style.height = canvasH + 'px';

        console.log('[CANVAS] expanded cssW=%d cssH=%d | dpr=%f | scale=%.4f | offsetX=%.1f offsetY=%.1f',
          canvasW, canvasH, dpr, scale, offsetX, offsetY);

        this.redrawExpanded();
      });
    });
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

    // Apply DPR scaling
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

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
      'unusable_column': 'columns',
      'blocked_dead_corner': 'columns'
    };

    const zoneTypes = ['unusable_clearance', 'unusable_aisle', 'usable', 'unusable_column', 'blocked_dead_corner'];

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

    // Restore DPR transform
    ctx.restore();

    console.log('[SpacePlanning] Expanded canvas redraw complete');
  },

  // ============================================================
  // FIT-TO-VIEW UTILITIES
  // ============================================================

  /**
   * Single source of truth for viewport measurement.
   * Uses getBoundingClientRect on the canvas wrapper — works even when
   * canvas CSS size hasn't updated yet (SPA route injection, hidden modals).
   */
  getViewportRect(canvas) {
    const el = canvas || this.elements.canvas;
    if (!el) return null;
    // Prefer parent's rect — more reliable than the canvas itself
    // because canvas CSS may still be '100%' before first layout pass
    const parent = el.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return null;
    return rect;
  },

  /**
   * Compute fit-to-view transform for a given bounding box inside a viewport.
   * Returns { scale, offsetX, offsetY } in CSS pixels.
   * safetyFactor < 1.0 adds extra breathing room.
   */
  computeFitTransform(bbox, viewportRect, paddingPx = 40, safetyFactor = 0.90) {
    const bboxW = Math.max(bbox.maxX - bbox.minX, 1);
    const bboxH = Math.max(bbox.maxZ - bbox.minZ, 1);
    const vw = viewportRect.width;
    const vh = viewportRect.height;

    const scaleX = (vw - paddingPx * 2) / bboxW;
    const scaleY = (vh - paddingPx * 2) / bboxH;
    const scale = Math.min(scaleX, scaleY) * safetyFactor;

    const offsetX = (vw - bboxW * scale) / 2;
    const offsetY = (vh - bboxH * scale) / 2;

    console.log(
      '[FIT] viewportW=%d viewportH=%d | bboxW=%d bboxH=%d | scaleX=%.4f scaleY=%.4f | chosenScale=%.4f | offsetX=%.1f offsetY=%.1f',
      vw, vh, bboxW, bboxH, scaleX, scaleY, scale, offsetX, offsetY
    );

    // Verify no clipping
    const mappedMaxX = bbox.minX * scale + offsetX + bboxW * scale;
    const mappedMaxZ = bbox.minZ * scale + offsetY + bboxH * scale;
    if (mappedMaxX > vw || mappedMaxZ > vh) {
      console.warn('[FIT] WARNING: mapped bbox exceeds viewport! mappedMaxX=%d, mappedMaxZ=%d', Math.round(mappedMaxX), Math.round(mappedMaxZ));
    }

    return { scale, offsetX, offsetY };
  },

  resizeCanvas() {
    const canvas = this.elements.canvas;
    if (!canvas) return false;

    // Orphan Check: Stop everything and clean up if the canvas is no longer part of the live DOM
    if (!document.body.contains(canvas)) {
      console.log('[CANVAS] Canvas is no longer in DOM. Cleaning up orphaned instance...');
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
      if (this._handleWindowResize) {
        window.removeEventListener('resize', this._handleWindowResize);
        this._handleWindowResize = null;
      }
      if (this._resizeRafId) {
        cancelAnimationFrame(this._resizeRafId);
        this._resizeRafId = null;
      }
      this.elements.canvas = null;
      this.elements.ctx = null;
      return false;
    }

    // Always set 100%/100% in CSS first so the parent controls sizing
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // Use getBoundingClientRect on PARENT — most reliable source
    const viewportRect = this.getViewportRect(canvas);
    if (!viewportRect) {
      // Cancel previous pending RAF to avoid stacking
      if (this._resizeRafId) cancelAnimationFrame(this._resizeRafId);
      
      if (!this._deferWarningLogged) {
        console.warn('[CANVAS] resizeCanvas: viewport not ready, deferring... (this warning is throttled)');
        this._deferWarningLogged = true;
      }
      
      this._resizeRafId = requestAnimationFrame(() => this.resizeCanvas());
      return;
    }

    // Reset throttle flag when successful
    this._deferWarningLogged = false;

    const dpr = window.devicePixelRatio || 1;
    const cssW = viewportRect.width;
    const cssH = viewportRect.height;

    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    // Pin CSS size explicitly so canvas element matches parent
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    console.log('[CANVAS] cssW=%d cssH=%d | dpr=%f | internalW=%d internalH=%d', cssW, cssH, dpr, canvas.width, canvas.height);

    this.requestRender();
    return true;
  },


  redraw() {
    const ctx = this.elements.ctx;
    const canvas = this.elements.canvas;
    if (!ctx || !canvas) {
      console.warn('[SpacePlanning] Cannot redraw: missing ctx or canvas');
      return;
    }

    // [VERIFY-D] canvas sizing at render time
    console.log('[VERIFY-D] canvas.width=%d canvas.height=%d | clientW=%d clientH=%d | offsetW=%d offsetH=%d',
      canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight, canvas.offsetWidth, canvas.offsetHeight);

    // Expose self on window so SecondaryRegionEditor can delegate
    if (globalThis.window) {
      globalThis.window.SpacePlanning = this;
    }
    // Clear entire internal buffer
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply DPR scaling so all draw calls use CSS-pixel coordinates
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Draw grid
    this.drawGrid();

    // Draw container outline
    this.drawContainer();

    // Draw zones by type - 柱子最後畫（在最上層）
    const layerMap = {
      'unusable_clearance': 'clearance',
      'unusable_aisle': 'aisles',
      'usable': 'usable',
      'unusable_column': 'columns',
      'blocked_dead_corner': 'columns'
    };

    const zoneTypes = ['unusable_clearance', 'unusable_aisle', 'usable', 'unusable_column', 'blocked_dead_corner'];

    zoneTypes.forEach(type => {
      const layerKey = layerMap[type];
      const isVisible = this.state.layerVisibility[layerKey];

      if (!isVisible) return;

      const zonesToDraw = this.state.zones.filter(z => z.type === type);
      zonesToDraw.forEach(zone => this.drawZone(zone));
    });

    // Restore DPR transform
    ctx.restore();

    console.log('[SpacePlanning] Redraw complete');
  },

  drawGrid() {
    const ctx = this.elements.ctx;
    const canvas = this.elements.canvas;

    // Use CSS pixel dimensions (ctx is already DPR-scaled)
    const displayWidth = canvas.clientWidth || (canvas.width / (window.devicePixelRatio || 1));
    const displayHeight = canvas.clientHeight || (canvas.height / (window.devicePixelRatio || 1));

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Adaptive grid size: keep grid lines in 30-80px range
    const minDim = Math.min(displayWidth, displayHeight);
    const gridSize = Math.max(30, Math.min(80, Math.round(minDim / 15)));

    for (let x = 0; x < displayWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, displayHeight);
      ctx.stroke();
    }

    for (let y = 0; y < displayHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(displayWidth, y);
      ctx.stroke();
    }
  },

  drawContainer() {
    const config = this.state.containerConfig;
    if (!config) return;

    const ctx = this.elements.ctx;
    const outline = getFootprintOutlinePoints(config);
    if (!outline.length) return;

    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    outline.forEach((point, index) => {
      const canvasPoint = this.worldToCanvas(point.x, point.z, 0, 0);
      if (index === 0) {
        ctx.moveTo(canvasPoint.x, canvasPoint.y);
      } else {
        ctx.lineTo(canvasPoint.x, canvasPoint.y);
      }
    });
    ctx.closePath();
    ctx.stroke();

    ctx.setLineDash([]);
  },

  drawZone(zone) {
    const ctx = this.elements.ctx;

    const styles = {
      unusable_column: { fill: '#6b7280', stroke: '#4b5563' },
      unusable_aisle: { fill: '#9ca3af', stroke: '#6b7280' },
      unusable_clearance: { fill: '#d1d5db', stroke: '#9ca3af' },
      usable: { fill: '#3b82f6', stroke: '#2563eb' },
      blocked_dead_corner: { fill: '#b45309', stroke: '#92400e' }
    };

    const style = styles[zone.type] || { fill: '#64748b', stroke: '#475569' };

    const rect = this.worldToCanvas(
      zone.x - zone.width / 2,
      zone.y - zone.height / 2,
      zone.width,
      zone.height
    );

    console.log(`[SpacePlanning] Drawing zone ${zone.type} at canvas (${Math.round(rect.x)}, ${Math.round(rect.y)}) size ${Math.round(rect.width)}x${Math.round(rect.height)}`);

    ctx.fillStyle = style.fill;
    ctx.globalAlpha = zone.type === 'unusable_column' ? 0.8 : 0.4;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    ctx.globalAlpha = 1;
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = zone.type === 'unusable_column' ? 3 : 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

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

    // Use getBoundingClientRect — consistent with resizeCanvas
    const viewportRect = this.getViewportRect(canvas);
    if (!viewportRect) return { x: 0, y: 0, width: 0, height: 0 };

    const { scale, offsetX, offsetY } = this.computeFitTransform(bounds, viewportRect);

    return {
      x: (worldX - bounds.minX) * scale + offsetX,
      y: (worldY - bounds.minZ) * scale + offsetY,
      width: worldW * scale,
      height: worldH * scale
    };
  },

  // ============================================================
  // SECONDARY EDITING MODE
  // ============================================================

  enterSecondaryEditMode() {
    if (this.state.readOnlyMode) return;
    console.log('[SpacePlanning] Entering secondary edit mode...');

    // Check if we have usable regions
    if (!spacePlanningPersistenceService.hasEditableRegions(this.state.zones)) {
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
    secondaryRegionEditorBridge.activateEditingMode();

    console.log('[SpacePlanning] Secondary edit mode activated');
  }
};

// Expose to global scope for HTML onclick handlers
if (globalThis.window) {
  globalThis.window.SpacePlanning = SpacePlanningPage;
}
