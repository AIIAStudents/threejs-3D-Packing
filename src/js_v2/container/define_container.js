export const DefineContainerPage = {
  API_BASE: 'http://127.0.0.1:8888/api',
  scene: null,
  camera: null,
  renderer: null,
  containerMesh: null,

  init() {
    this.form = document.getElementById('container-form');
    this.shapeSelect = document.getElementById('shape-select');
    this.previewContainer = document.getElementById('preview-3d');

    if (!this.form) return;

    // Init Three.js scene
    this.initThreeJS();

    // Button event listeners
    document.getElementById('save-changes-btn')?.addEventListener('click', () => this.handleSaveChanges());
    document.getElementById('next-step-btn')?.addEventListener('click', () => this.handleNextStep());

    // Event listeners
    this.shapeSelect?.addEventListener('change', () => {
      this.updateShapeInputs();
      this.updatePreview();
    });

    this.form.addEventListener('submit', (e) => this.handleSubmit(e));

    // Listen to all input changes for real-time preview
    this.form.querySelectorAll('input[type="number"]').forEach(input => {
      input.addEventListener('input', () => this.updatePreview());
    });

    // Initial state
    this.updateShapeInputs();
    this.updatePreview();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
  },

  initThreeJS() {
    if (!this.previewContainer) {
      console.error('Preview container not found!');
      return;
    }

    // Check if THREE is loaded
    if (typeof THREE === 'undefined') {
      console.error('Three.js is not loaded! Make sure the CDN script is loaded before this module.');
      this.previewContainer.innerHTML = '<div style="color: red; padding: 20px;">錯誤：Three.js 未載入</div>';
      return;
    }

    console.log('Initializing Three.js scene...');

    // Scene
    this.scene = new THREE.Scene();
    // Explicit Dark Background (Deep Slate)
    this.scene.background = new THREE.Color(0x0f172a);

    // Camera
    const width = this.previewContainer.clientWidth;
    const height = this.previewContainer.clientHeight;
    console.log('Preview container size:', width, 'x', height);

    if (width === 0 || height === 0) {
      console.warn('Preview container has zero dimensions!');
    }

    // Fix: Increase far clipping plane to 500000 to prevent floor clipping when zooming out
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 500000);
    this.camera.position.set(8000, 6000, 8000);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    // Added logarithmicDepthBuffer: true to fix Z-fighting
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.previewContainer.appendChild(this.renderer.domElement);
    console.log('Renderer added to DOM');

    // Lighting (Immersive Dark Theme)
    // 1. Ambient
    const ambientLight = new THREE.AmbientLight(0x475569, 1.2);
    this.scene.add(ambientLight);

    // 2. Main Directional (Sun)
    const dirLight = new THREE.DirectionalLight(0xe0f2fe, 3.0);
    dirLight.position.set(5000, 10000, 5000);
    this.scene.add(dirLight);

    // 3. Point Lights (Sparkle)
    const pointLight1 = new THREE.PointLight(0x3b82f6, 5, 5000);
    pointLight1.position.set(-1000, 2000, -1000);
    this.scene.add(pointLight1);

    // Fog (Linear)
    this.scene.fog = new THREE.Fog(0x0f172a, 40000, 100000);

    // Infinite Grid & Floor System
    // 1. Reflective Floor
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

    // 2. Dual Grid
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

    // OrbitControls (if available)
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.2; // Snappier controls
      console.log('OrbitControls initialized');
    } else {
      console.warn('OrbitControls not available');
    }

    // Start animation loop
    this.animate();
    console.log('Three.js initialization complete');
  },

  animate() {
    requestAnimationFrame(() => this.animate());

    if (this.controls) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  },

  onWindowResize() {
    if (!this.previewContainer || !this.camera || !this.renderer) return;

    const width = this.previewContainer.clientWidth;
    const height = this.previewContainer.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  },

  updateShapeInputs() {
    const selectedShape = this.shapeSelect.value;

    // Hide all dims groups
    document.querySelectorAll('.dims-group').forEach(group => {
      group.classList.remove('active');
    });

    // Show selected shape dims
    const activeGroup = document.querySelector(`[data-shape="${selectedShape}"]`);
    if (activeGroup) {
      activeGroup.classList.add('active');
    }
  },

  updatePreview() {
    if (!this.scene) return;

    const shape = this.shapeSelect.value;
    const formData = new FormData(this.form);

    // Get current values
    const config = {
      shape,
      heightY: parseFloat(formData.get('heightY')) || 2400
    };

    // Shape-specific parameters
    if (shape === 'rect') {
      config.widthX = parseFloat(formData.get('widthX')) || 5800;
      config.depthZ = parseFloat(formData.get('depthZ')) || 2300;
    } else if (shape === 'u_shape') {
      config.outerWidthX = parseFloat(formData.get('outerWidthX')) || 6000;
      config.outerDepthZ = parseFloat(formData.get('outerDepthZ')) || 3000;
      config.gapWidthX = parseFloat(formData.get('gapWidthX')) || 2000;
      config.gapDepthZ = parseFloat(formData.get('gapDepthZ')) || 1000;
    } else if (shape === 't_shape') {
      config.stemWidthX = parseFloat(formData.get('stemWidthX')) || 2000;
      config.stemDepthZ = parseFloat(formData.get('stemDepthZ')) || 4000;
      config.crossWidthX = parseFloat(formData.get('crossWidthX')) || 4000;
      config.crossDepthZ = parseFloat(formData.get('crossDepthZ')) || 1000;
      config.crossOffsetZ = parseFloat(formData.get('crossOffsetZ')) || 1500;
    }

    // Remove old container mesh
    if (this.containerMesh) {
      this.scene.remove(this.containerMesh);
    }

    // Create new container mesh
    this.containerMesh = this.createContainerMesh(config);
    if (this.containerMesh) {
      this.scene.add(this.containerMesh);
    }

    // Update info display
    const shapeNames = {
      'rect': '矩形',
      'u_shape': 'U 型',
      't_shape': 'T 型'
    };
    document.getElementById('info-shape').textContent = shapeNames[shape] || shape;
    document.getElementById('info-height').textContent = `${config.heightY} mm`;
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
      const { outerWidthX: ow, outerDepthZ: od, gapWidthX: gw, gapDepthZ: gd } = config;
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
      // T-Shape: horizontal bar (cross) on top, vertical stem below
      const { stemWidthX: sw, stemDepthZ: sd, crossWidthX: cw, crossDepthZ: cd, crossOffsetZ: co } = config;

      // Calculate centering offset for stem
      const stemOffsetX = (cw - sw) / 2;

      shape = new THREE.Shape();

      // Start from bottom-left of stem
      shape.moveTo(stemOffsetX, 0);
      // Bottom-right of stem
      shape.lineTo(stemOffsetX + sw, 0);
      // Up to where cross starts (right side of stem)
      shape.lineTo(stemOffsetX + sw, co);
      // Extend right to edge of cross
      shape.lineTo(cw, co);
      // Up to top of cross
      shape.lineTo(cw, co + cd);
      // Left across top of cross
      shape.lineTo(0, co + cd);
      // Down left side of cross
      shape.lineTo(0, co);
      // Right to left side of stem
      shape.lineTo(stemOffsetX, co);
      // Close path back to start
      shape.lineTo(stemOffsetX, 0);
    }

    if (!shape) return null;

    // Extrude settings
    const extrudeSettings = {
      depth: config.heightY,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Rotate to stand upright and center
    geometry.rotateX(-Math.PI / 2);

    // Material (Industrial Glass)
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide
    });

    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);

    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(geometry, material));
    mesh.add(wireframe);

    return mesh;
  },

  async handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(this.form);
    const shape = formData.get('shape');

    const config = {
      shape,
      heightY: parseFloat(formData.get('heightY'))
    };

    // Collect shape-specific parameters
    if (shape === 'rect') {
      config.widthX = parseFloat(formData.get('widthX'));
      config.depthZ = parseFloat(formData.get('depthZ'));
    } else if (shape === 'u_shape') {
      config.outerWidthX = parseFloat(formData.get('outerWidthX'));
      config.outerDepthZ = parseFloat(formData.get('outerDepthZ'));
      config.gapWidthX = parseFloat(formData.get('gapWidthX'));
      config.gapDepthZ = parseFloat(formData.get('gapDepthZ'));
    } else if (shape === 't_shape') {
      config.stemWidthX = parseFloat(formData.get('stemWidthX'));
      config.stemDepthZ = parseFloat(formData.get('stemDepthZ'));
      config.crossWidthX = parseFloat(formData.get('crossWidthX'));
      config.crossDepthZ = parseFloat(formData.get('crossDepthZ'));
      config.crossOffsetZ = parseFloat(formData.get('crossOffsetZ'));
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

    alert('容器設定已儲存！');

    // Navigate to next step
    window.dispatchEvent(new CustomEvent('route-change', {
      detail: { path: '/src/html/cut_container.html' }
    }));
  },

  async handleSaveChanges() {
    try {
      // Trigger form submit logic without navigation
      const formData = new FormData(this.form);
      const shape = formData.get('shape');
      const config = {
        shape,
        heightY: parseFloat(formData.get('heightY'))
      };

      // Collect shape-specific parameters
      if (shape === 'rect') {
        config.widthX = parseFloat(formData.get('widthX'));
        config.depthZ = parseFloat(formData.get('depthZ'));
      } else if (shape === 'u_shape') {
        config.outerWidthX = parseFloat(formData.get('outerWidthX'));
        config.outerDepthZ = parseFloat(formData.get('outerDepthZ'));
        config.gapWidthX = parseFloat(formData.get('gapWidthX'));
        config.gapDepthZ = parseFloat(formData.get('gapDepthZ'));
      } else if (shape === 't_shape') {
        config.stemWidthX = parseFloat(formData.get('stemWidthX'));
        config.stemDepthZ = parseFloat(formData.get('stemDepthZ'));
        config.crossWidthX = parseFloat(formData.get('crossWidthX'));
        config.crossDepthZ = parseFloat(formData.get('crossDepthZ'));
        config.crossOffsetZ = parseFloat(formData.get('crossOffsetZ'));
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

      // Show Success Modal
      const modal = document.getElementById('success-modal');
      const successTitle = modal.querySelector('.modal-title');
      const okBtn = document.getElementById('btn-modal-ok');

      if (modal && okBtn) {
        successTitle.textContent = '更新成功';
        modal.classList.add('active');

        const handleOk = () => {
          modal.classList.remove('active');
          okBtn.removeEventListener('click', handleOk);
        };

        okBtn.addEventListener('click', handleOk);
      } else {
        alert('✓ 容器設定已儲存！');
      }

    } catch (error) {
      console.error('Save error:', error);
      alert('❌ 儲存失敗：' + error.message);
    }
  },

  async handleNextStep() {
    // Just navigate, don't save
    window.location.hash = '/src/html/cut_container.html';
  }
};
