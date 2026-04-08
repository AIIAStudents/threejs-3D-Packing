import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { throttle, DynamicQualityScaler } from '../utils/performance.js';
import { apiClient } from '../../frontend/app/api/api-client.js';
import { storageAdapter } from '../../frontend/app/storage/storage-adapter.js';
import { planningV2Storage } from '../../frontend/contexts/planning-v2/infrastructure/planning-v2-storage.js';
import { normalizePlanningIntent } from '../../frontend/contexts/planning-v2/domain/planning-intent.js';
import {
  getFootprintOutlinePoints,
  normalizeWarehouseContainerConfig
} from '../../frontend/contexts/space-design/domain/warehouse-layout-planner.js';

export const DefineContainerPage = {
  // Three.js
  scene: null,
  camera: null,
  renderer: null,
  containerMesh: null,
  controls: null,
  animationId: null,
  _resizeHandler: null,
  qualityScaler: null,
  isSceneReady: false,
  renderRequested: false,

  // Wizard state
  currentStep: 1,
  totalSteps: 5,
  wizardState: {
    mode: null,              // 'ping' or 'mm'
    template: null,          // 'ecommerce', '3pl', 'manufacturing', 'custom'

    // Ping mode
    area_ping: null,
    height_m: null,
    aspect_ratio: null,
    custom_ratio: null,
    usable_ratio: 0.75,

    // MM mode
    x_mm: null,
    z_mm: null,
    y_mm: null,

    // Shape
    shape: 'rect',

    // Warehouse planning defaults
    primary_aisle_width: 2400,
    secondary_aisle_width: 1600,
    safety_buffer_mm: 300,
    boundary_inspection_aisle_width: 1000,
    preserve_central_main_aisle: true,
    preserve_boundary_inspection_aisle: false,
    main_aisle_axis: 'auto',
    layout_strategy: 'balanced',
    target_storage_band_mm: 2400,
    grid_size_mm: 200,

    // T-shape params
    t_stem_width: 1800,
    t_head_depth: 1800,
    t_opening_direction: 'north',

    // U-shape params
    u_opening_width: 2200,
    u_opening_depth: 1400,
    u_opening_direction: 'north',

    // Derived values
    A_m2: null,
    effective_A_m2: null,
    X_mm: null,
    Z_mm: null,
    Y_mm: null
  },

  // Constants
  PING_TO_M2: 3.3058,
  M_TO_MM: 1000,

  // Templates
  templates: {
    ecommerce: {
      label: '電商倉（Fulfillment）',
      aspect_ratio: 2.5,
      height_m: 4.5,
      usable_ratio: 0.75
    },
    '3pl': {
      label: '3PL 倉（第三方物流）',
      aspect_ratio: 3.0,
      height_m: 7.0,
      usable_ratio: 0.80
    },
    manufacturing: {
      label: '製造倉（工廠）',
      aspect_ratio: 4.0,
      height_m: 9.0,
      usable_ratio: 0.85
    },
    custom: {
      label: '自訂（不套模板）',
      aspect_ratio: 2.0,
      height_m: 4.5,
      usable_ratio: 0.80
    }
  },

  init() {
    this.dispose();
    // Bind navigation
    this.bindNavigation();

    // Bind step 1: Mode selection
    this.bindStep1();

    // Bind step 2: Template selection
    this.bindStep2();

    // Bind step 3: Dimensions input
    this.bindStep3();

    // Bind step 4: Shape selection
    this.bindStep4();

    // Check if user is in edit mode (URL parameter: ?edit=true or #edit)
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const isEditMode = urlParams.get('edit') === 'true' || hashParams.get('edit') === 'true';

    // Check if user has existing config
    const savedConfig = this.loadSavedConfig();

    if (isEditMode && savedConfig) {
      // User is explicitly editing existing config - jump to Step 5
      this.currentStep = 5;
      this.restoreWizardState(savedConfig);
      this.showStep(5);
      this.prepareStep5();
    } else {
      // New setup or re-setup - start from Step 1
      this.currentStep = 1;
      this.showStep(1);
    }

    // Update UI
    this.updateProgressBar();
    this.updateNavigationButtons();
  },

  applyQuickModeBridgeCopy() {
    const finishBtn = document.getElementById('btn-finish');
    const modalTitle = document.querySelector('#success-modal .modal-title');
    const modalDescription = document.querySelector('#success-modal p');
    const okBtn = document.getElementById('btn-modal-ok');

    if (finishBtn) {
      finishBtn.textContent = '儲存並進入快速模式';
    }

    if (modalTitle) {
      modalTitle.textContent = '空間定義已完成';
    }

    if (modalDescription) {
      modalDescription.textContent = '倉儲空間外框與基本條件已保存，接下來會直接進入快速模式，讓你用問答方式生成規劃方案。';
    }

    if (okBtn) {
      okBtn.textContent = '前往快速模式';
    }
  },

  buildQuickModeDraft() {
    return normalizePlanningIntent({
      warehouse: {
        shape: this.wizardState.shape === 'rect' ? 'rectangle' : this.wizardState.shape,
        shape_params: {
          t_stem_width_mm: this.wizardState.t_stem_width,
          t_head_depth_mm: this.wizardState.t_head_depth,
          t_opening_direction: this.wizardState.t_opening_direction,
          u_opening_width_mm: this.wizardState.u_opening_width,
          u_opening_depth_mm: this.wizardState.u_opening_depth,
          u_opening_direction: this.wizardState.u_opening_direction
        },
        dimensions: {
          length_mm: this.wizardState.X_mm,
          width_mm: this.wizardState.Z_mm,
          height_mm: this.wizardState.Y_mm
        },
        entrances: [
          {
            id: 'entry_main',
            side: 'south',
            width_mm: Math.max(1800, Math.round((this.wizardState.X_mm || 12000) * 0.12))
          }
        ]
      },
      planning_preferences: {
        preferred_layout_style: this.wizardState.layout_strategy === 'high_density'
          ? 'high_density'
          : this.wizardState.layout_strategy === 'high_efficiency'
            ? 'high_efficiency'
            : 'balanced'
      }
    });
  },

  bindNavigation() {
    document.getElementById('btn-prev')?.addEventListener('click', () => this.prevStep());
    document.getElementById('btn-next')?.addEventListener('click', () => this.nextStep());
    document.getElementById('btn-finish')?.addEventListener('click', () => this.finish());
  },

  bindStep1() {
    document.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.wizardState.mode = card.dataset.mode;
      });
    });
  },

  bindStep2() {
    document.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.wizardState.template = card.dataset.template;

        // Apply template defaults
        const template = this.templates[this.wizardState.template];
        if (template && this.wizardState.mode === 'ping') {
          this.wizardState.aspect_ratio = template.aspect_ratio;
          this.wizardState.height_m = template.height_m;
          this.wizardState.usable_ratio = template.usable_ratio;
        }
      });
    });
  },

  bindStep3() {
    // Aspect ratio change
    const aspectRatioSelect = document.getElementById('aspect-ratio');
    const customRatioGroup = document.getElementById('custom-ratio-group');

    aspectRatioSelect?.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        customRatioGroup.style.display = 'block';
      } else {
        customRatioGroup.style.display = 'none';
        this.wizardState.aspect_ratio = parseFloat(e.target.value);
      }
      this.updateConversionPreview();
    });

    // Custom ratio input
    document.getElementById('custom-ratio')?.addEventListener('input', (e) => {
      this.wizardState.custom_ratio = parseFloat(e.target.value);
      this.updateConversionPreview();
    });

    // Reserve walkway checkbox
    document.getElementById('reserve-walkway')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.wizardState.usable_ratio = 0.80;
        document.getElementById('usable-ratio').value = 0.80;
      }
      this.updateConversionPreview();
    });

    // All ping mode inputs
    ['area-ping', 'height-m', 'usable-ratio'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        this.updateConversionPreview();
      });
    });

    // All mm mode inputs
    ['x-mm', 'z-mm', 'y-mm'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        this.updateMMSummary();
      });
    });
  },

  bindStep4() {
    document.querySelectorAll('.shape-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.shape-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.wizardState.shape = card.dataset.shape;

        // Show/hide non-standard params
        const nonstandardParams = document.getElementById('nonstandard-params');
        if (nonstandardParams) {
          nonstandardParams.style.display = 'block';
        }

        document.querySelectorAll('.shape-params').forEach(p => {
          p.style.display = 'none';
        });

        const shapeParams = document.getElementById(`${this.wizardState.shape}-params`);
        if (shapeParams) {
          shapeParams.style.display = 'grid';
        }

        this.updatePreview();
      });
    });

    [
      'primary-aisle-width',
      'secondary-aisle-width',
      'safety-buffer-mm',
      'boundary-inspection-aisle-width',
      'target-storage-band-mm',
      'grid-size-mm',
      't-stem-width',
      't-head-depth',
      'u-opening-width',
      'u-opening-depth'
    ].forEach(id => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        const key = id.replace(/-/g, '_');
        this.wizardState[key] = parseFloat(e.target.value);
        this.updatePreview();
      });
    });

    [
      'main-aisle-axis',
      'layout-strategy',
      't-opening-direction',
      'u-opening-direction'
    ].forEach(id => {
      document.getElementById(id)?.addEventListener('change', (e) => {
        const key = id.replace(/-/g, '_');
        this.wizardState[key] = e.target.value;
        this.updatePreview();
      });
    });

    [
      'preserve-central-main-aisle',
      'preserve-boundary-inspection-aisle'
    ].forEach(id => {
      document.getElementById(id)?.addEventListener('change', (e) => {
        const key = id.replace(/-/g, '_');
        this.wizardState[key] = e.target.checked;
        this.updatePreview();
      });
    });
  },

  updateConversionPreview() {
    const areaPing = parseFloat(document.getElementById('area-ping')?.value) || 0;
    const heightM = parseFloat(document.getElementById('height-m')?.value) || 0;
    const usableRatio = parseFloat(document.getElementById('usable-ratio')?.value) || 0.75;

    let aspectRatio = this.wizardState.aspect_ratio;
    if (document.getElementById('aspect-ratio')?.value === 'custom') {
      aspectRatio = this.wizardState.custom_ratio || 2.0;
    }

    if (areaPing > 0 && heightM > 0 && aspectRatio > 0) {
      // Calculate
      const A_m2 = areaPing * this.PING_TO_M2;
      const effective_A_m2 = A_m2 * usableRatio;
      const Z_m = Math.sqrt(effective_A_m2 / aspectRatio);
      const X_m = aspectRatio * Z_m;
      const Y_m = heightM;

      const X_mm = Math.round(X_m * this.M_TO_MM);
      const Z_mm = Math.round(Z_m * this.M_TO_MM);
      const Y_mm = Math.round(Y_m * this.M_TO_MM);

      // Update state
      this.wizardState.area_ping = areaPing;
      this.wizardState.height_m = heightM;
      this.wizardState.usable_ratio = usableRatio;
      this.wizardState.A_m2 = A_m2;
      this.wizardState.effective_A_m2 = effective_A_m2;
      this.wizardState.X_mm = X_mm;
      this.wizardState.Z_mm = Z_mm;
      this.wizardState.Y_mm = Y_mm;

      // Update UI
      document.getElementById('nominal-area').textContent = `${A_m2.toFixed(2)} m²`;
      document.getElementById('effective-area').textContent = `${effective_A_m2.toFixed(2)} m²`;
      document.getElementById('converted-dims').textContent = `${X_mm} × ${Z_mm} × ${Y_mm} mm`;
    }
  },

  updateMMSummary() {
    const x = parseFloat(document.getElementById('x-mm')?.value) || 0;
    const z = parseFloat(document.getElementById('z-mm')?.value) || 0;
    const y = parseFloat(document.getElementById('y-mm')?.value) || 0;

    this.wizardState.x_mm = x;
    this.wizardState.z_mm = z;
    this.wizardState.y_mm = y;
    this.wizardState.X_mm = x;
    this.wizardState.Z_mm = z;
    this.wizardState.Y_mm = y;

    document.getElementById('mm-dims-summary').textContent = `${x} × ${z} × ${y} mm`;
  },

  nextStep() {
    // Validate current step
    if (!this.validateStep(this.currentStep)) {
      return;
    }

    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.showStep(this.currentStep);
      this.updateProgressBar();
      this.updateNavigationButtons();

      // Special handling for step 3
      if (this.currentStep === 3) {
        this.prepareStep3();
      }

      // Special handling for step 4
      if (this.currentStep === 4) {
        this.prepareStep4();
      }

      // Special handling for step 5
      if (this.currentStep === 5) {
        this.prepareStep5();
      }
    }
  },

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.showStep(this.currentStep);
      this.updateProgressBar();
      this.updateNavigationButtons();

      if (this.currentStep === 4) {
        this.prepareStep4();
      }
    }
  },

  showStep(step) {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    document.querySelector(`.wizard-step[data-step="${step}"]`)?.classList.add('active');

    // Update step indicators
    document.querySelectorAll('.step-indicator').forEach((indicator, index) => {
      indicator.classList.remove('active', 'completed');
      if (index + 1 < step) {
        indicator.classList.add('completed');
      } else if (index + 1 === step) {
        indicator.classList.add('active');
      }
    });
  },

  updateProgressBar() {
    const progress = ((this.currentStep - 1) / (this.totalSteps - 1)) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
  },

  updateNavigationButtons() {
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnFinish = document.getElementById('btn-finish');

    // Show/hide prev button
    if (this.currentStep === 1) {
      btnPrev.style.display = 'none';
    } else {
      btnPrev.style.display = 'flex';
    }

    // Show/hide next vs finish
    if (this.currentStep === this.totalSteps) {
      btnNext.style.display = 'none';
      btnFinish.style.display = 'flex';
    } else {
      btnNext.style.display = 'flex';
      btnFinish.style.display = 'none';
    }
  },

  validateStep(step) {
    switch (step) {
      case 1:
        if (!this.wizardState.mode) {
          alert('請選擇空間定義方式');
          return false;
        }
        return true;

      case 2:
        if (!this.wizardState.template) {
          alert('請選擇倉型模板');
          return false;
        }
        return true;

      case 3:
        if (this.wizardState.mode === 'ping') {
          const areaPing = parseFloat(document.getElementById('area-ping')?.value);
          const heightM = parseFloat(document.getElementById('height-m')?.value);
          if (!areaPing || areaPing <= 0) {
            alert('請輸入有效的倉庫面積（坪）');
            return false;
          }
          if (!heightM || heightM < 2.5 || heightM > 15) {
            alert('請輸入有效的倉庫高度（2.5-15 公尺）');
            return false;
          }
        } else {
          const x = parseFloat(document.getElementById('x-mm')?.value);
          const z = parseFloat(document.getElementById('z-mm')?.value);
          const y = parseFloat(document.getElementById('y-mm')?.value);
          if (!x || !z || !y || x <= 0 || z <= 0 || y <= 0) {
            alert('請輸入有效的尺寸（mm）');
            return false;
          }
        }
        return true;

      case 4:
        if (!this.wizardState.shape) {
          alert('請選擇空間形狀');
          return false;
        }

        {
          const readNumber = (id) => parseFloat(document.getElementById(id)?.value);
          const positiveFields = [
            ['primary-aisle-width', '請輸入有效的主要走道寬度'],
            ['secondary-aisle-width', '請輸入有效的次要走道寬度'],
            ['target-storage-band-mm', '請輸入有效的目標儲位帶寬'],
            ['grid-size-mm', '請輸入有效的規劃網格粒度']
          ];

          for (const [id, message] of positiveFields) {
            const value = readNumber(id);
            if (!Number.isFinite(value) || value <= 0) {
              alert(message);
              return false;
            }
          }

          const safetyBuffer = readNumber('safety-buffer-mm');
          const boundaryAisle = readNumber('boundary-inspection-aisle-width');
          if (!Number.isFinite(safetyBuffer) || safetyBuffer < 0) {
            alert('安全距離 / 緩衝區不可小於 0');
            return false;
          }
          if (!Number.isFinite(boundaryAisle) || boundaryAisle < 0) {
            alert('邊界巡檢走道不可小於 0');
            return false;
          }

          if (this.wizardState.shape === 't_shape') {
            const stemWidth = readNumber('t-stem-width');
            const headDepth = readNumber('t-head-depth');
            if (!Number.isFinite(stemWidth) || stemWidth <= 0) {
              alert('請輸入有效的 T 型主幹寬度');
              return false;
            }
            if (!Number.isFinite(headDepth) || headDepth <= 0) {
              alert('請輸入有效的 T 型分支深度');
              return false;
            }
          }

          if (this.wizardState.shape === 'u_shape') {
            const openingWidth = readNumber('u-opening-width');
            const openingDepth = readNumber('u-opening-depth');
            if (!Number.isFinite(openingWidth) || openingWidth <= 0) {
              alert('請輸入有效的 U 型開口寬度');
              return false;
            }
            if (!Number.isFinite(openingDepth) || openingDepth <= 0) {
              alert('請輸入有效的 U 型開口深度');
              return false;
            }
          }
        }
        return true;

      default:
        return true;
    }
  },

  prepareStep3() {
    // Show/hide input sections based on mode
    const pingMode = document.querySelector('.ping-mode');
    const mmMode = document.querySelector('.mm-mode');

    if (this.wizardState.mode === 'ping') {
      pingMode.style.display = 'block';
      mmMode.style.display = 'none';

      // Apply template defaults
      const template = this.templates[this.wizardState.template];
      if (template) {
        document.getElementById('aspect-ratio').value = template.aspect_ratio;
        document.getElementById('height-m').value = template.height_m;
        document.getElementById('usable-ratio').value = template.usable_ratio;
        this.wizardState.aspect_ratio = template.aspect_ratio;
        this.wizardState.height_m = template.height_m;
        this.wizardState.usable_ratio = template.usable_ratio;
      }
    } else {
      pingMode.style.display = 'none';
      mmMode.style.display = 'block';
    }
  },

  prepareStep4() {
    document.querySelectorAll('.shape-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.shape === this.wizardState.shape);
    });

    const nonstandardParams = document.getElementById('nonstandard-params');
    if (nonstandardParams) {
      nonstandardParams.style.display = 'block';
    }

    document.querySelectorAll('.shape-params').forEach(params => {
      params.style.display = 'none';
    });

    const activeShapeParams = document.getElementById(`${this.wizardState.shape}-params`);
    if (activeShapeParams) {
      activeShapeParams.style.display = 'grid';
    }

    const setValue = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.value = value;
      }
    };

    const setChecked = (id, checked) => {
      const element = document.getElementById(id);
      if (element) {
        element.checked = checked;
      }
    };

    setValue('primary-aisle-width', this.wizardState.primary_aisle_width);
    setValue('secondary-aisle-width', this.wizardState.secondary_aisle_width);
    setValue('safety-buffer-mm', this.wizardState.safety_buffer_mm);
    setValue('boundary-inspection-aisle-width', this.wizardState.boundary_inspection_aisle_width);
    setValue('main-aisle-axis', this.wizardState.main_aisle_axis);
    setValue('layout-strategy', this.wizardState.layout_strategy);
    setValue('target-storage-band-mm', this.wizardState.target_storage_band_mm);
    setValue('grid-size-mm', this.wizardState.grid_size_mm);
    setValue('t-stem-width', this.wizardState.t_stem_width);
    setValue('t-head-depth', this.wizardState.t_head_depth);
    setValue('t-opening-direction', this.wizardState.t_opening_direction);
    setValue('u-opening-width', this.wizardState.u_opening_width);
    setValue('u-opening-depth', this.wizardState.u_opening_depth);
    setValue('u-opening-direction', this.wizardState.u_opening_direction);
    setChecked('preserve-central-main-aisle', this.wizardState.preserve_central_main_aisle);
    setChecked('preserve-boundary-inspection-aisle', this.wizardState.preserve_boundary_inspection_aisle);

    this.updatePreview();
  },

  prepareStep5() {
    // Update summary
    this.updateSummary();

    // Initialize Three.js (only now!)
    this.initThreeJS();
  },

  updateSummary() {
    const modeLabels = { ping: '坪數換算', mm: '毫米輸入' };
    const shapeLabels = {
      rect: 'RECT 矩形',
      t_shape: 'T 型',
      u_shape: 'U 型'
    };
    const strategyLabels = {
      balanced: '平衡型',
      storage_first: '儲位優先',
      picking_first: '揀貨優先'
    };

    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      }
    };

    setText('summary-mode', modeLabels[this.wizardState.mode] || '-');
    setText('summary-template', this.templates[this.wizardState.template]?.label || '-');

    const areaSection = document.getElementById('summary-area-section');
    if (areaSection) {
      areaSection.style.display = this.wizardState.mode === 'ping' ? 'block' : 'none';
    }

    if (this.wizardState.mode === 'ping') {
      setText('summary-input-area', `${this.wizardState.area_ping} 坪`);
      setText('summary-nominal', `${this.wizardState.A_m2?.toFixed(2)} m²`);
      setText('summary-ratio', `${(this.wizardState.usable_ratio * 100).toFixed(0)}%`);
      setText('summary-effective', `${this.wizardState.effective_A_m2?.toFixed(2)} m²`);
    }

    setText('summary-x', `${this.wizardState.X_mm} mm`);
    setText('summary-z', `${this.wizardState.Z_mm} mm`);
    setText('summary-y', `${this.wizardState.Y_mm} mm`);
    setText('summary-shape', shapeLabels[this.wizardState.shape] || '-');
    setText('summary-primary-aisle', `${this.wizardState.primary_aisle_width} mm`);
    setText('summary-secondary-aisle', `${this.wizardState.secondary_aisle_width} mm`);
    setText('summary-safety-buffer', `${this.wizardState.safety_buffer_mm} mm`);
    setText('summary-main-aisle', this.wizardState.preserve_central_main_aisle ? '保留' : '不保留');
    setText('summary-boundary-aisle', this.wizardState.preserve_boundary_inspection_aisle ? '保留' : '不保留');
    setText('summary-layout-strategy', strategyLabels[this.wizardState.layout_strategy] || '平衡型');
  },

  // ========== Load & Restore Saved Config ==========

  loadSavedConfig() {
    try {
      return storageAdapter.getJSON('containerConfig', null);
    } catch (error) {
      console.warn('Failed to load saved config:', error);
    }
    return null;
  },

  restoreWizardState(config) {
    console.log('Restoring wizard state from saved config:', config);

    // Restore mode and template
    this.wizardState.mode = config.mode || 'mm';
    this.wizardState.template = config.template || 'custom';

    // Restore shape
    this.wizardState.shape = config.shape || 'rect';

    // Restore dimensions
    this.wizardState.X_mm = config.widthX;
    this.wizardState.Z_mm = config.depthZ;
    this.wizardState.Y_mm = config.heightY;

    const planning = config.planning || {};
    this.wizardState.primary_aisle_width = planning.primaryAisleWidth || this.wizardState.primary_aisle_width;
    this.wizardState.secondary_aisle_width = planning.secondaryAisleWidth || this.wizardState.secondary_aisle_width;
    this.wizardState.safety_buffer_mm = planning.safetyBuffer || this.wizardState.safety_buffer_mm;
    this.wizardState.boundary_inspection_aisle_width = planning.boundaryInspectionAisleWidth || this.wizardState.boundary_inspection_aisle_width;
    this.wizardState.preserve_central_main_aisle = planning.preserveCentralMainAisle ?? this.wizardState.preserve_central_main_aisle;
    this.wizardState.preserve_boundary_inspection_aisle = planning.preserveBoundaryInspectionAisle ?? this.wizardState.preserve_boundary_inspection_aisle;
    this.wizardState.main_aisle_axis = planning.mainAisleAxis || this.wizardState.main_aisle_axis;
    this.wizardState.layout_strategy = planning.strategy || this.wizardState.layout_strategy;
    this.wizardState.target_storage_band_mm = planning.targetStorageBand || this.wizardState.target_storage_band_mm;
    this.wizardState.grid_size_mm = planning.gridSizeMm || this.wizardState.grid_size_mm;

    this.wizardState.t_stem_width = config.t_stem_width || config.t_bottom_x || this.wizardState.t_stem_width;
    this.wizardState.t_head_depth = config.t_head_depth || config.t_top_z || this.wizardState.t_head_depth;
    this.wizardState.t_opening_direction = config.t_opening_direction || this.wizardState.t_opening_direction;
    this.wizardState.u_opening_width = config.u_opening_width || config.u_gap_x || this.wizardState.u_opening_width;
    this.wizardState.u_opening_depth = config.u_opening_depth || config.u_gap_z || this.wizardState.u_opening_depth;
    this.wizardState.u_opening_direction = config.u_opening_direction || this.wizardState.u_opening_direction;

    // If mode is ping, try to restore ping-related values
    // (Note: we may not have these in old configs, so we'll derive them if needed)
    if (this.wizardState.mode === 'ping' && config.area_ping) {
      this.wizardState.area_ping = config.area_ping;
      this.wizardState.height_m = config.height_m;
      this.wizardState.aspect_ratio = config.aspect_ratio;
      this.wizardState.usable_ratio = config.usable_ratio;
      this.wizardState.A_m2 = config.A_m2;
      this.wizardState.effective_A_m2 = config.effective_A_m2;
    }

    // Mark all steps as completed
    document.querySelectorAll('.step-indicator').forEach((indicator, index) => {
      if (index < 4) { // Steps 1-4
        indicator.classList.add('completed');
      }
    });
  },

  // ========== Three.js (Only initialized in Step 5) ==========

  initThreeJS() {
    const previewContainer = document.getElementById('preview-3d');
    if (!previewContainer) return;

    this.isSceneReady = false;
    this.containerMesh = null;
    this.renderRequested = false;

    this.initMinimalThree(previewContainer);
    this.initScene();
  },

  initMinimalThree(container) {
    console.log('Initializing Three.js...');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(50, width / height, 10, 100000);
    this.camera.position.set(8000, 6000, 8000);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      logarithmicDepthBuffer: true
    });
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.6;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15;

    this.controls.addEventListener('change', () => this.requestRender());

    this.qualityScaler = new DynamicQualityScaler(
      this.renderer,
      this.scene,
      this.camera,
      () => this.requestRender()
    );

    this.requestRender();

    this._resizeHandler = () => {
      if (!container || !this.camera || !this.renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.requestRender();
    };
    window.addEventListener('resize', this._resizeHandler);
  },

  initScene() {
    if (this.isSceneReady) return;
    console.log('Initializing scene...');

    // Simple, stable lighting setup
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    this.hemiLight.position.set(0, 20000, 0);
    this.scene.add(this.hemiLight);

    // Main directional light
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(5000, 10000, 5000);
    this.scene.add(this.dirLight);

    // Fog
    this.scene.fog = new THREE.Fog(0x0f172a, 40000, 100000);

    // Floor
    const planeGeo = new THREE.PlaneGeometry(100000, 100000);
    const planeMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      metalness: 0.2,
      roughness: 0.1,
      transparent: true,
      opacity: 0.8,
      reflectivity: 0.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.2
    });
    const floor = new THREE.Mesh(planeGeo, planeMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -20;
    this.scene.add(floor);

    // Grid
    const gridMajor = new THREE.GridHelper(100000, 20, 0x3b82f6, 0x3b82f6);
    gridMajor.position.y = -19;
    gridMajor.material.opacity = 0.3;
    gridMajor.material.transparent = true;
    this.scene.add(gridMajor);

    const gridMinor = new THREE.GridHelper(100000, 1000, 0x1e293b, 0x1e293b);
    gridMinor.position.y = -19;
    gridMinor.material.opacity = 0.1;
    gridMinor.material.transparent = true;
    this.scene.add(gridMinor);

    this.isSceneReady = true;

    // Create container mesh
    this.updatePreview();
  },

  updatePreview() {
    if (!this.scene || !this.isSceneReady) return;

    // Remove old mesh
    if (this.containerMesh) {
      this.scene.remove(this.containerMesh);
    }

    // Create new mesh
    const rawConfig = {
      shape: this.wizardState.shape,
      widthX: this.wizardState.X_mm,
      depthZ: this.wizardState.Z_mm,
      heightY: this.wizardState.Y_mm,
      ...this.wizardState
    };
    const config = normalizeWarehouseContainerConfig({
      ...rawConfig,
      planning: {
        primaryAisleWidth: this.wizardState.primary_aisle_width,
        secondaryAisleWidth: this.wizardState.secondary_aisle_width,
        safetyBuffer: this.wizardState.safety_buffer_mm,
        boundaryInspectionAisleWidth: this.wizardState.boundary_inspection_aisle_width,
        preserveCentralMainAisle: this.wizardState.preserve_central_main_aisle,
        preserveBoundaryInspectionAisle: this.wizardState.preserve_boundary_inspection_aisle,
        mainAisleAxis: this.wizardState.main_aisle_axis,
        strategy: this.wizardState.layout_strategy,
        targetStorageBand: this.wizardState.target_storage_band_mm,
        gridSizeMm: this.wizardState.grid_size_mm
      }
    });

    this.containerMesh = this.createContainerMesh(config);
    if (this.containerMesh) {
      this.scene.add(this.containerMesh);

      // Auto-position camera to fit container
      this.fitCameraToContainer(config);
    }

    this.requestRender();
  },

  fitCameraToContainer(config) {
    if (!this.camera || !this.controls) return;

    const { widthX, depthZ, heightY } = config;

    // Calculate container center
    const centerX = widthX / 2;
    const centerZ = depthZ / 2;
    const centerY = heightY / 2;

    // Calculate bounding sphere radius
    const maxDim = Math.max(widthX, depthZ, heightY);

    // Update camera near/far based on scene scale
    this.camera.near = maxDim * 0.01;
    this.camera.far = maxDim * 10;
    this.camera.updateProjectionMatrix();
    const distance = maxDim * 1.8; // Closer view for better detail

    // Position camera at 45° angle for good perspective
    const angle = Math.PI / 4; // 45 degrees
    const cameraX = centerX + distance * Math.cos(angle);
    const cameraZ = centerZ + distance * Math.sin(angle);
    const cameraY = centerY + distance * 0.6; // Slightly elevated

    this.camera.position.set(cameraX, cameraY, cameraZ);
    this.camera.lookAt(centerX, centerY, centerZ);

    // Update controls target
    this.controls.target.set(centerX, centerY, centerZ);
    this.controls.update();

    // Position lights around container for optimal illumination
    if (this.dirLight) {
      this.dirLight.position.set(
        centerX + maxDim * 1.5,
        centerY + maxDim * 2,
        centerZ + maxDim * 1.5
      );
    }
  },

  createContainerMesh(config) {
    const outline = getFootprintOutlinePoints(config);
    if (!outline || outline.length < 3) return null;

    const shape = new THREE.Shape();
    shape.moveTo(outline[0].x, outline[0].z);
    outline.slice(1).forEach(point => {
      shape.lineTo(point.x, point.z);
    });
    shape.lineTo(outline[0].x, outline[0].z);

    const extrudeSettings = {
      depth: config.heightY,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshPhongMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      shininess: 30
    });

    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.9,
      linewidth: 2
    });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);

    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(geometry, material));
    mesh.add(wireframe);

    return mesh;
  },

  animate() {
    if (!this.renderRequested) return;
    this.renderRequested = false;

    if (this.controls) {
      this.controls.update();
    }

    try {
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (e) {
      console.error('Render error:', e);
    }
  },

  requestRender() {
    if (!this.renderRequested) {
      this.renderRequested = true;
      this.animationId = requestAnimationFrame(() => this.animate());
    }
  },

  // ========== Save & Finish ==========

  async finish() {
    try {
      const rawConfig = {
        mode: this.wizardState.mode,
        template: this.wizardState.template,
        shape: this.wizardState.shape,
        widthX: this.wizardState.X_mm,
        depthZ: this.wizardState.Z_mm,
        heightY: this.wizardState.Y_mm,
        planning: {
          primaryAisleWidth: this.wizardState.primary_aisle_width,
          secondaryAisleWidth: this.wizardState.secondary_aisle_width,
          safetyBuffer: this.wizardState.safety_buffer_mm,
          boundaryInspectionAisleWidth: this.wizardState.boundary_inspection_aisle_width,
          preserveCentralMainAisle: this.wizardState.preserve_central_main_aisle,
          preserveBoundaryInspectionAisle: this.wizardState.preserve_boundary_inspection_aisle,
          mainAisleAxis: this.wizardState.main_aisle_axis,
          strategy: this.wizardState.layout_strategy,
          targetStorageBand: this.wizardState.target_storage_band_mm,
          gridSizeMm: this.wizardState.grid_size_mm
        }
      };

      if (this.wizardState.shape === 't_shape') {
        rawConfig.t_stem_width = this.wizardState.t_stem_width;
        rawConfig.t_head_depth = this.wizardState.t_head_depth;
        rawConfig.t_opening_direction = this.wizardState.t_opening_direction;
      } else if (this.wizardState.shape === 'u_shape') {
        rawConfig.u_opening_width = this.wizardState.u_opening_width;
        rawConfig.u_opening_depth = this.wizardState.u_opening_depth;
        rawConfig.u_opening_direction = this.wizardState.u_opening_direction;
      }

      const config = normalizeWarehouseContainerConfig(rawConfig);

      storageAdapter.setJSON('containerConfig', config);
      planningV2Storage.saveDraft(this.buildQuickModeDraft());
      planningV2Storage.saveLatestResult(null);

      // Save to database
      try {
        await apiClient.post('/api/v2/containers/', config);
      } catch (error) {
        console.warn('API error, but saved to localStorage:', error);
      }

      // Show success modal
      const modal = document.getElementById('success-modal');
      const okBtn = document.getElementById('btn-modal-ok');
      const finishBtn = document.getElementById('btn-finish');
      const modalTitle = document.querySelector('#success-modal .modal-title');
      const modalDescription = document.querySelector('#success-modal p');

      if (finishBtn) {
        finishBtn.textContent = '儲存並進入快速模式';
      }

      if (modalTitle) {
        modalTitle.textContent = '空間定義已完成';
      }

      if (modalDescription) {
        modalDescription.textContent = '倉儲空間外框與基本條件已保存，接下來會直接進入快速模式，讓你用問答方式生成規劃方案。';
      }

      if (okBtn) {
        okBtn.textContent = '前往快速模式';
      }

      if (modal && okBtn) {
        modal.classList.add('active');

        const handleOk = () => {
          modal.classList.remove('active');
          okBtn.removeEventListener('click', handleOk);

          window.location.hash = '/planning-v2';
        };

        okBtn.addEventListener('click', handleOk);
      } else {
        alert('✓ 容器設定已儲存！');
        window.location.hash = '/planning-v2';
      }

    } catch (error) {
      console.error('Save error:', error);
      alert('❌ 儲存失敗：' + error.message);
    }
  },

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    this.qualityScaler = null;

    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }

    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      this.scene = null;
    }

    this.camera = null;
    this.containerMesh = null;
    this.isSceneReady = false;

    console.log('[DefineContainerPage] Disposed resources');
  }
};
