import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { throttle, DynamicQualityScaler } from '../utils/performance.js';

export const DefineContainerPage = {
  API_BASE: 'http://127.0.0.1:8888/api',

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
    shape: 'rect',           // 'rect', 't_shape', 'u_shape', 'l_shape'

    // Non-standard params
    t_bottom_x: 1500,
    t_bottom_z: 4000,
    t_top_x: 4000,
    t_top_z: 1500,
    u_outer_x: 6000,
    u_outer_z: 3000,
    u_gap_x: 2000,
    u_gap_z: 1000,

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
        if (this.wizardState.shape === 'rect') {
          nonstandardParams.style.display = 'none';
        } else {
          nonstandardParams.style.display = 'block';

          // Hide all shape params
          document.querySelectorAll('.shape-params').forEach(p => p.style.display = 'none');

          // Show selected shape params
          const shapeParams = document.getElementById(`${this.wizardState.shape}-params`);
          if (shapeParams) shapeParams.style.display = 'grid';
        }
      });
    });

    // Bind non-standard param inputs
    ['t-bottom-x', 't-bottom-z', 't-top-x', 't-top-z',
      'u-outer-x', 'u-outer-z', 'u-gap-x', 'u-gap-z'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', (e) => {
          const key = id.replace(/-/g, '_');
          this.wizardState[key] = parseFloat(e.target.value);
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

  prepareStep5() {
    // Update summary
    this.updateSummary();

    // Initialize Three.js (only now!)
    this.initThreeJS();
  },

  updateSummary() {
    const modeLabels = { ping: '坪數輸入', mm: '尺寸輸入' };
    document.getElementById('summary-mode').textContent = modeLabels[this.wizardState.mode] || '-';
    document.getElementById('summary-template').textContent =
      this.templates[this.wizardState.template]?.label || '-';

    // Area section (only for ping mode)
    const areaSection = document.getElementById('summary-area-section');
    if (this.wizardState.mode === 'ping') {
      areaSection.style.display = 'block';
      document.getElementById('summary-input-area').textContent =
        `${this.wizardState.area_ping} 坪`;
      document.getElementById('summary-nominal').textContent =
        `${this.wizardState.A_m2?.toFixed(2)} m²`;
      document.getElementById('summary-ratio').textContent =
        `${(this.wizardState.usable_ratio * 100).toFixed(0)}%`;
      document.getElementById('summary-effective').textContent =
        `${this.wizardState.effective_A_m2?.toFixed(2)} m²`;
    } else {
      areaSection.style.display = 'none';
    }

    // Dimensions
    document.getElementById('summary-x').textContent = `${this.wizardState.X_mm} mm`;
    document.getElementById('summary-z').textContent = `${this.wizardState.Z_mm} mm`;
    document.getElementById('summary-y').textContent = `${this.wizardState.Y_mm} mm`;

    // Shape
    const shapeLabels = {
      rect: '標準矩形',
      t_shape: 'T 型',
      u_shape: 'U 型'
    };
    document.getElementById('summary-shape').textContent =
      shapeLabels[this.wizardState.shape] || '-';
  },

  // ========== Load & Restore Saved Config ==========

  loadSavedConfig() {
    try {
      const saved = localStorage.getItem('containerConfig');
      if (saved) {
        return JSON.parse(saved);
      }
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

    // Restore shape-specific params
    if (config.t_bottom_x) this.wizardState.t_bottom_x = config.t_bottom_x;
    if (config.t_bottom_z) this.wizardState.t_bottom_z = config.t_bottom_z;
    if (config.t_top_x) this.wizardState.t_top_x = config.t_top_x;
    if (config.t_top_z) this.wizardState.t_top_z = config.t_top_z;
    if (config.u_outer_x) this.wizardState.u_outer_x = config.u_outer_x;
    if (config.u_outer_z) this.wizardState.u_outer_z = config.u_outer_z;
    if (config.u_gap_x) this.wizardState.u_gap_x = config.u_gap_x;
    if (config.u_gap_z) this.wizardState.u_gap_z = config.u_gap_z;

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
    const config = {
      shape: this.wizardState.shape,
      widthX: this.wizardState.X_mm,
      depthZ: this.wizardState.Z_mm,
      heightY: this.wizardState.Y_mm,
      ...this.wizardState
    };

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
    let shape;

    if (config.shape === 'rect') {
      shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(config.widthX, 0);
      shape.lineTo(config.widthX, config.depthZ);
      shape.lineTo(0, config.depthZ);
      shape.lineTo(0, 0);

    } else if (config.shape === 'u_shape') {
      const { u_outer_x: ow, u_outer_z: od, u_gap_x: gw, u_gap_z: gd } = config;
      shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(ow, 0);
      shape.lineTo(ow, od);
      shape.lineTo((ow + gw) / 2, od);
      shape.lineTo((ow + gw) / 2, od - gd);
      shape.lineTo((ow - gw) / 2, od - gd);
      shape.lineTo((ow - gw) / 2, od);
      shape.lineTo(0, od);
      shape.lineTo(0, 0);

    } else if (config.shape === 't_shape') {
      const { t_top_x: topWidth, t_top_z: topDepth, t_bottom_x: bottomWidth, t_bottom_z: bottomDepth } = config;
      const bottomOffsetX = (topWidth - bottomWidth) / 2;

      shape = new THREE.Shape();
      shape.moveTo(bottomOffsetX, 0);
      shape.lineTo(bottomOffsetX + bottomWidth, 0);
      shape.lineTo(bottomOffsetX + bottomWidth, bottomDepth);
      shape.lineTo(topWidth, bottomDepth);
      shape.lineTo(topWidth, bottomDepth + topDepth);
      shape.lineTo(0, bottomDepth + topDepth);
      shape.lineTo(0, bottomDepth);
      shape.lineTo(bottomOffsetX, bottomDepth);
      shape.lineTo(bottomOffsetX, 0);
    }

    if (!shape) return null;

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
      // Build final config
      const config = {
        mode: this.wizardState.mode,
        template: this.wizardState.template,
        shape: this.wizardState.shape,
        widthX: this.wizardState.X_mm,
        depthZ: this.wizardState.Z_mm,
        heightY: this.wizardState.Y_mm
      };

      // Add shape-specific params
      if (this.wizardState.shape === 't_shape') {
        config.t_bottom_x = this.wizardState.t_bottom_x;
        config.t_bottom_z = this.wizardState.t_bottom_z;
        config.t_top_x = this.wizardState.t_top_x;
        config.t_top_z = this.wizardState.t_top_z;
      } else if (this.wizardState.shape === 'u_shape') {
        config.u_outer_x = this.wizardState.u_outer_x;
        config.u_outer_z = this.wizardState.u_outer_z;
        config.u_gap_x = this.wizardState.u_gap_x;
        config.u_gap_z = this.wizardState.u_gap_z;
      }

      // Save to localStorage
      localStorage.setItem('containerConfig', JSON.stringify(config));

      // Save to database
      try {
        const response = await fetch(`${this.API_BASE}/containers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parameters: JSON.stringify(config) })
        });

        if (!response.ok) {
          console.warn('Failed to save to database, but saved to localStorage');
        }
      } catch (error) {
        console.warn('API error, but saved to localStorage:', error);
      }

      // Show success modal
      const modal = document.getElementById('success-modal');
      const okBtn = document.getElementById('btn-modal-ok');

      if (modal && okBtn) {
        modal.classList.add('active');

        const handleOk = () => {
          modal.classList.remove('active');
          okBtn.removeEventListener('click', handleOk);

          // Navigate to next page
          window.location.hash = '/src/html/cut_container.html';
        };

        okBtn.addEventListener('click', handleOk);
      } else {
        alert('✓ 容器設定已儲存！');
        window.location.hash = '/src/html/cut_container.html';
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
