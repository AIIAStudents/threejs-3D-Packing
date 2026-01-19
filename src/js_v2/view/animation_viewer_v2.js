import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DynamicQualityScaler } from '../utils/performance.js';

/**
 * NewAnimationViewer
 * Implements the "Immersive Dark Glass" visual style with step-by-step animation control.
 * Replaces the old AnimationViewer.
 */
export class NewAnimationViewer {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.timer = new THREE.Clock();

    // Animation State
    this.animationSteps = [];
    this.currentStep = 0;
    this.totalSteps = 0;
    this.isPlaying = false;
    this.speed = 1.0;
    this.animationInterval = null;

    // Visual State
    this.animatedItems = []; // List of meshes currently in scene
    this.itemsMap = new Map(); // Map step index to mesh

    // Event System
    this.listeners = {};

    // Performance
    this.qualityScaler = null;
    this.isDisposed = false;

    // Config (Inline for portability)
    this.CONFIG = {
      colors: {
        background: 0x0f172a,
        gridMajor: 0x3b82f6,
        gridMinor: 0x1e293b,
        neonEdge: 0xffffff,
        lights: {
          ambient: 0x475569,
          spot: 0xe0f2fe,
          point: 0x3b82f6
        }
      },
      industrialPalette: [
        0x00d2ff, // Electric Blue
        0x00ff9d, // Neon Green
        0xff9f00, // Safety Orange
        0xff0055, // Hot Pink
        0xf6ff00  // Bright Yellow
      ]
    };

    // Shared Resources for Performance
    this.sharedGeometry = null;  // Will be created on first use
    this.materialPool = [];      // Will be populated on first use
    this.sharedEdgeGeometry = null; // Already exists

    // Drag state for event debouncing
    this.isDragging = false;
  }

  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLights();
    this.setupControls();
    this.setupPerformanceManagers();
    this.initSharedResources(); // Initialize shared geometry/materials
    this.createInfiniteGrid();

    // Resize Handler
    window.addEventListener('resize', () => this.onWindowResize());

    this.renderRequested = false;

    // Animation Loop
    this.requestRender();

    console.log('[NewAnimationViewer] Initialized with Immersive Dark Theme');
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.CONFIG.colors.background);

    // Linear Fog for depth
    this.scene.fog = new THREE.Fog(this.CONFIG.colors.background, 40000, 100000);
  }

  setupCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 1, 500000);
    this.camera.position.set(4000, 3000, 4000);
    this.camera.lookAt(0, 0, 0);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true // Vital for Z-fighting fix
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // Optimized from PCFSoftShadowMap

    this.container.innerHTML = ''; // Clear previous
    this.container.appendChild(this.renderer.domElement);
  }

  setupLights() {
    // 1. Ambient
    const ambientLight = new THREE.AmbientLight(this.CONFIG.colors.lights.ambient, 1.2);
    this.scene.add(ambientLight);

    // 2. Main Directional
    const dirLight = new THREE.DirectionalLight(this.CONFIG.colors.lights.spot, 3.0);
    dirLight.position.set(5000, 10000, 5000);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;  // Reduced from 2048 for performance
    dirLight.shadow.mapSize.height = 1024; // 75% less pixels to render
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 20000;
    dirLight.shadow.camera.left = -5000;
    dirLight.shadow.camera.right = 5000;
    dirLight.shadow.camera.top = 5000;
    dirLight.shadow.camera.bottom = -5000;
    this.scene.add(dirLight);

    // Point Light removed for performance (was causing extra calculations)
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15; // Snappier damping
    this.controls.minDistance = 100;
    this.controls.maxDistance = 20000;

    // DECISIVE OPTIMIZATION: Connect controls to quality scaling & material swapping
    this.controls.addEventListener('start', () => {
      this.setContainerQuality(true); // Switch to Low Quality
      if (this.qualityScaler) this.qualityScaler.onInteractStart();
    });

    this.controls.addEventListener('change', () => {
      this.requestRender();
    });

    this.controls.addEventListener('end', () => {
      // Restore quality with delay to match Scaler
      if (this.qualityRestoreTimer) clearTimeout(this.qualityRestoreTimer);
      this.qualityRestoreTimer = setTimeout(() => {
        this.setContainerQuality(false); // Restore High Quality
      }, 200);

      if (this.qualityScaler) this.qualityScaler.onInteractEnd();
    });
  }

  setupPerformanceManagers() {
    // Dynamic Resolution Scaling
    this.qualityScaler = new DynamicQualityScaler(
      this.renderer,
      this.scene,
      this.camera,
      () => this.requestRender()
    );
  }

  initSharedResources() {
    // Shared BoxGeometry for all items (scaled per instance)
    this.sharedGeometry = new THREE.BoxGeometry(1, 1, 1);

    // Shared EdgeGeometry for neon edges
    this.sharedEdgeGeometry = new THREE.EdgesGeometry(this.sharedGeometry);

    // Material Pool (one per color to avoid shader recompilation)
    this.materialPool = this.CONFIG.industrialPalette.map(color =>
      new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.3,
        metalness: 0.1
      })
    );

    console.log(`[Performance] Initialized shared resources: 1 geometry, ${this.materialPool.length} materials`);
  }

  createInfiniteGrid() {
    // 1. Simplified Floor (MeshStandardMaterial for performance)
    const planeGeo = new THREE.PlaneGeometry(100000, 100000);
    const planeMat = new THREE.MeshStandardMaterial({
      color: this.CONFIG.colors.background,
      metalness: 0.1,
      roughness: 0.7,
      transparent: true,
      opacity: 0.5
    });
    const floor = new THREE.Mesh(planeGeo, planeMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -20;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. Dual Grid
    const gridMajor = new THREE.GridHelper(100000, 20, this.CONFIG.colors.gridMajor, this.CONFIG.colors.gridMajor);
    gridMajor.position.y = -19;
    gridMajor.material.opacity = 0.3;
    gridMajor.material.transparent = true;
    this.scene.add(gridMajor);

    const gridMinor = new THREE.GridHelper(100000, 1000, this.CONFIG.colors.gridMinor, this.CONFIG.colors.gridMinor);
    gridMinor.position.y = -19;
    gridMinor.material.opacity = 0.1;
    gridMinor.material.transparent = true;
    this.scene.add(gridMinor);
  }

  // --- Animation Cycle ---

  animate() {
    // Stop if disposed or browser tab backgrounded
    if (this.isDisposed || !this.renderer) return;

    // Render-on-demand condition:
    // 1. Animation playing (stepping) OR
    // 2. Drop animation active (items moving) OR
    // 3. Explicit render request (interaction/controls) OR
    // 4. Quality scaler is in transition (restoring quality)
    const activeDrop = this.updateDropAnimations();
    const qualityRestoring = this.qualityScaler?.isInteracting === false && this.qualityScaler?.timer !== null;

    if (!this.isPlaying && !activeDrop && !this.renderRequested && !qualityRestoring) {
      this.animationId = null; // Mark as stoichiometric static
      return;
    }

    this.renderRequested = false;

    // Direct loop call only if we are in active motion or playing
    this.animationId = requestAnimationFrame(() => this.animate());

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  requestRender() {
    if (!this.renderRequested) {
      this.renderRequested = true;
      // If loop stopped, restart it
      // We can just call animate() which checks flags
      cancelAnimationFrame(this.animationId); // prevent dupes
      this.animationId = requestAnimationFrame(() => this.animate());
    }
  }

  updateDropAnimations() {
    let isActive = false;
    // Handle the "drop-in" physics for active meshes
    this.animatedItems.forEach(mesh => {
      if (mesh.userData.isLanded) return;

      const data = mesh.userData;
      if (!data.targetY) return;

      const diff = data.targetY - mesh.position.y;

      if (Math.abs(diff) < 0.5) {
        mesh.position.y = data.targetY;
        data.isLanded = true;
      } else {
        mesh.position.y += diff * 0.1; // Smooth lerp
        isActive = true;
      }
    });
    return isActive;
  }

  // --- API Methods ---

  loadAnimation(data) {
    console.log('[NewAnimationViewer] Loading Data:', data);
    this.reset();

    // 1. Create Container
    if (data.container) this.createGlassContainer(data.container);

    // 2. Process Steps
    // Expecting data.items to be the ordered list of items
    this.animationSteps = data.items.map((item, index) => ({
      stepNumber: index + 1,
      item: item,
      position: this.calculatePosition(item),
      size: this.calculateSize(item)
    }));
    this.totalSteps = this.animationSteps.length;

    // 3. Fit Camera
    this.fitCamera(data.container);
  }

  calculatePosition(item) {
    if (!item.pose) return { x: 0, y: 0, z: 0 };
    const { min, max } = item.pose;
    // Apply zone offsets if needed (assuming pre-calculated in data preprocessing)
    const offsetX = item.zoneOffset ? item.zoneOffset.x : 0;
    const offsetZ = item.zoneOffset ? item.zoneOffset.y : 0;

    return {
      x: (min.x + max.x) / 2 + offsetX,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2 + offsetZ
    };
  }

  calculateSize(item) {
    if (!item.pose) return { w: 100, h: 100, d: 100 };
    return {
      w: item.pose.max.x - item.pose.min.x,
      h: item.pose.max.y - item.pose.min.y,
      d: item.pose.max.z - item.pose.min.z
    };
  }

  reset() {
    this.pause();
    this.currentStep = 0;

    // Clear items
    this.itemsMap.forEach(mesh => this.scene.remove(mesh));
    this.itemsMap.clear();
    this.animatedItems = [];

    // Reset container if exists
    // (Optional: keep container, clear only items. For now clear all dynamic items)
    // Actually better to fully clear logic scene objects:
    if (this.containerMesh) {
      this.scene.remove(this.containerMesh);
      this.containerMesh = null;
    }

    this.emit('stepChange', { step: 0, total: this.totalSteps || 0 });
  }

  // Step Logic

  nextStep() {
    if (this.currentStep < this.totalSteps) {
      const stepIndex = this.currentStep; // 0-based index for next item
      this.renderItem(stepIndex);
      this.currentStep++;
      this.emit('stepChange', { step: this.currentStep, total: this.totalSteps });
    }
  }

  previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.removeItem(this.currentStep);
      this.emit('stepChange', { step: this.currentStep, total: this.totalSteps });
    }
  }

  renderItem(index) {
    const step = this.animationSteps[index];
    if (!step) return;

    // Create Mesh
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const color = this.CONFIG.industrialPalette[index % this.CONFIG.industrialPalette.length];

    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Set Dimensions
    mesh.scale.set(step.size.w, step.size.h, step.size.d);

    // Initial Drop Position
    const targetY = step.position.y;
    const startY = targetY + 800;

    mesh.position.set(step.position.x, startY, step.position.z);

    // Conditional shadow casting (only for large items)
    const volume = step.size.w * step.size.h * step.size.d;
    mesh.castShadow = volume > 500000; // Only large items cast shadows
    mesh.receiveShadow = true;

    // Animation Data
    mesh.userData = {
      targetY: targetY,
      isLanded: false
    };

    // Neon Edges (shared geometry for performance)
    if (!this.sharedEdgeGeometry) {
      this.sharedEdgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    }
    const edges = new THREE.LineSegments(
      this.sharedEdgeGeometry,
      new THREE.LineBasicMaterial({ color: this.CONFIG.colors.neonEdge, transparent: true, opacity: 0.6 })
    );
    mesh.add(edges);

    this.scene.add(mesh);
    this.itemsMap.set(index, mesh); // Track it
    this.animatedItems.push(mesh);  // Animate it
  }

  removeItem(index) {
    const mesh = this.itemsMap.get(index);
    if (mesh) {
      this.scene.remove(mesh);
      this.itemsMap.delete(index);

      // Remove from animated list
      const animIdx = this.animatedItems.indexOf(mesh);
      if (animIdx > -1) this.animatedItems.splice(animIdx, 1);
    }
  }

  // Playback Logic

  play() {
    if (this.isPlaying) return;
    if (this.currentStep >= this.totalSteps) this.reset();

    this.isPlaying = true;
    this.playNextLoop();
  }

  playNextLoop() {
    if (!this.isPlaying) return;
    if (this.currentStep >= this.totalSteps) {
      this.isPlaying = false;
      this.emit('animationComplete');
      return;
    }

    this.nextStep();

    // Delay based on speed
    const baseDelay = 500; // ms
    const delay = baseDelay / this.speed;

    this.animationInterval = setTimeout(() => this.playNextLoop(), delay);
  }

  pause() {
    this.isPlaying = false;
    if (this.animationInterval) {
      clearTimeout(this.animationInterval);
      this.animationInterval = null;
    }
  }

  setSpeed(val) {
    this.speed = val;
  }

  seekToPercent(percent) {
    const target = Math.floor(this.totalSteps * percent);
    this.seekToStep(target);
  }

  /**
   * Calculates differential update to reach target step efficiently.
   * Uses async chunking for large jumps to prevent UI freezing.
   */
  async seekToStep(targetStep) {
    this.pause();

    // Clamp
    targetStep = Math.max(0, Math.min(targetStep, this.totalSteps));

    if (targetStep === this.currentStep) return;

    const diff = Math.abs(targetStep - this.currentStep);
    const CHUNK_SIZE = 15; // Process 15 items per chunk
    const CHUNK_THRESHOLD = 20; // Use chunking if diff > 20

    // Differential Update
    if (targetStep > this.currentStep) {
      // Forward: Add items
      if (diff > CHUNK_THRESHOLD) {
        // Large jump: process in chunks
        for (let i = this.currentStep; i < targetStep; i += CHUNK_SIZE) {
          const end = Math.min(i + CHUNK_SIZE, targetStep);
          for (let j = i; j < end; j++) {
            this.renderItemInstant(j);
          }
          // Yield to main thread after each chunk
          if (i + CHUNK_SIZE < targetStep) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      } else {
        // Small jump: process all at once
        for (let i = this.currentStep; i < targetStep; i++) {
          this.renderItemInstant(i);
        }
      }
    } else {
      // Backward: Remove items
      if (diff > CHUNK_THRESHOLD) {
        // Large jump: process in chunks
        for (let i = this.currentStep - 1; i >= targetStep; i -= CHUNK_SIZE) {
          const end = Math.max(i - CHUNK_SIZE + 1, targetStep);
          for (let j = i; j >= end; j--) {
            this.removeItem(j);
          }
          // Yield to main thread after each chunk
          if (i - CHUNK_SIZE >= targetStep) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      } else {
        // Small jump: process all at once
        for (let i = this.currentStep - 1; i >= targetStep; i--) {
          this.removeItem(i);
        }
      }
    }

    this.currentStep = targetStep;

    // Only emit events if not dragging (debounce during drag)
    if (!this.isDragging) {
      this.emit('stepChange', { step: this.currentStep, total: this.totalSteps });
    }

    // Explicitly request render after seek
    this.requestRender();
  }

  /**
   * Allows external controllers (like sliders) to trigger low-quality interaction mode
   */
  setInteractionState(isActive) {
    if (!this.qualityScaler) return;

    if (isActive) {
      this.qualityScaler.onInteractionStart();
    } else {
      this.qualityScaler.onInteractionEnd();
    }
  }

  renderItemInstant(index) {
    // Only add if not already present
    if (this.itemsMap.has(index)) return;

    // Same as renderItem but placed at targetY immediately
    const step = this.animationSteps[index];
    if (!step) return;

    // Use shared geometry and material pool
    const material = this.materialPool[index % this.materialPool.length];
    const mesh = new THREE.Mesh(this.sharedGeometry, material);

    mesh.scale.set(step.size.w, step.size.h, step.size.d);
    mesh.position.set(step.position.x, step.position.y, step.position.z);
    mesh.userData = { isLanded: true, targetY: step.position.y }; // Already there

    // Conditional shadow casting (only for large items)
    const volume = step.size.w * step.size.h * step.size.d;
    mesh.castShadow = volume > 500000;
    mesh.receiveShadow = true;

    // Use shared EdgeGeometry
    const edges = new THREE.LineSegments(
      this.sharedEdgeGeometry,
      new THREE.LineBasicMaterial({ color: this.CONFIG.colors.neonEdge, transparent: true, opacity: 0.6 })
    );
    mesh.add(edges);

    this.scene.add(mesh);
    this.itemsMap.set(index, mesh);

    // IMPORTANT: Do NOT add to animatedItems to avoid 'activeDrop' logic 
    // simply let it sit there. 
    // If we want to allow it to be animated later if we switch to play mode from here...
    // Actually play mode logic uses 'renderItem' which resets position.
    // So 'seek' implies 'static placement'.
  }

  createGlassContainer(config) {
    const shape = config.shape || 'rect';

    console.log('[NewAnimationViewer] Creating container - shape:', shape);
    console.log('[NewAnimationViewer] Config:', config);

    // Prepare Materials
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6,
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.9,
      thickness: 10.0,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });

    this.wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      wireframe: true,
      transparent: true,
      opacity: 0.15
    });

    switch (shape) {
      case 'u_shape':
        this.createUShapeGlassContainer(config);
        break;
      case 't_shape':
        this.createTShapeGlassContainer(config);
        break;
      case 'rect':
      default:
        this.createRectGlassContainer(config);
        break;
    }
  }

  createRectGlassContainer(config) {
    const width = config.widthX || config.parameters?.widthX || 5800;
    const height = config.heightY || config.parameters?.heightY || 2400;
    const depth = config.depthZ || config.parameters?.depthZ || 2300;

    console.log('[NewAnimationViewer] Drawing RECT container:', { width, height, depth });

    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(width / 2, height / 2, depth / 2);

    // Use prepared material
    this.containerMesh = new THREE.Mesh(geometry, this.glassMaterial);
    this.scene.add(this.containerMesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    );
    this.containerMesh.add(edges);
  }

  createUShapeGlassContainer(config) {
    const outerWidth = config.outerWidthX || config.parameters?.outerWidthX || 5800;
    const outerDepth = config.outerDepthZ || config.parameters?.outerDepthZ || 2300;
    const gapWidth = config.gapWidthX || config.parameters?.gapWidthX || 1000;
    const gapDepth = config.gapDepthZ || config.parameters?.gapDepthZ || 800;
    const height = config.heightY || config.parameters?.heightY || 2400;

    console.log('[NewAnimationViewer] Drawing U-SHAPE container:', { outerWidth, outerDepth, gapWidth, gapDepth, height });

    // Create U-shape using THREE.Shape
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(outerWidth, 0);
    shape.lineTo(outerWidth, outerDepth);
    shape.lineTo((outerWidth + gapWidth) / 2, outerDepth);
    shape.lineTo((outerWidth + gapWidth) / 2, outerDepth - gapDepth);
    shape.lineTo((outerWidth - gapWidth) / 2, outerDepth - gapDepth);
    shape.lineTo((outerWidth - gapWidth) / 2, outerDepth);
    shape.lineTo(0, outerDepth);
    shape.lineTo(0, 0);

    const extrudeSettings = {
      depth: height,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(Math.PI / 2);

    // 旋轉後，擠出的高度方向變成 -Y，需要向上平移使底部在 Y=0
    geometry.translate(0, height, 0);

    // Use prepared material
    this.containerMesh = new THREE.Mesh(geometry, this.glassMaterial);
    this.scene.add(this.containerMesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    );
    this.containerMesh.add(edges);
  }

  createTShapeGlassContainer(config) {
    const topWidth = config.topWidthX || config.parameters?.topWidthX || 4000;
    const bottomWidth = config.bottomWidthX || config.parameters?.bottomWidthX || 1500;
    const topDepth = config.topDepthZ || config.parameters?.topDepthZ || 1500;
    const bottomDepth = config.bottomDepthZ || config.parameters?.bottomDepthZ || 4000;
    const height = config.heightY || config.parameters?.heightY || 2400;

    console.log('[NewAnimationViewer] Drawing T-SHAPE container:', { topWidth, bottomWidth, topDepth, bottomDepth, height });

    // Create T-shape using THREE.Shape
    const shape = new THREE.Shape();

    const leftEdge = (topWidth - bottomWidth) / 2;
    const rightEdge = leftEdge + bottomWidth;

    shape.moveTo(leftEdge, 0);
    shape.lineTo(rightEdge, 0);
    shape.lineTo(rightEdge, bottomDepth);
    shape.lineTo(topWidth, bottomDepth);
    shape.lineTo(topWidth, bottomDepth + topDepth);
    shape.lineTo(0, bottomDepth + topDepth);
    shape.lineTo(0, bottomDepth);
    shape.lineTo(leftEdge, bottomDepth);
    shape.lineTo(leftEdge, 0);

    const extrudeSettings = {
      depth: height,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(Math.PI / 2);

    // 旋轉後，擠出的高度方向變成 -Y，需要向上平移使底部在 Y=0
    geometry.translate(0, height, 0);

    // Use prepared material
    this.containerMesh = new THREE.Mesh(geometry, this.glassMaterial);
    this.scene.add(this.containerMesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    );
    this.containerMesh.add(edges);
  }

  /**
   * Swaps container material between High Quality (Glass) and Low Quality (Wireframe)
   */
  setContainerQuality(isLowQuality) {
    if (!this.containerMesh || !this.glassMaterial || !this.wireframeMaterial) return;

    // Avoid redundant swaps
    if (isLowQuality && this.containerMesh.material === this.wireframeMaterial) return;
    if (!isLowQuality && this.containerMesh.material === this.glassMaterial) return;

    this.containerMesh.material = isLowQuality ? this.wireframeMaterial : this.glassMaterial;
    this.requestRender();
  }

  fitCamera(container) {
    if (!container) return;

    const width = container.widthX || 5800;
    const height = container.heightY || 2400;
    const depth = container.depthZ || 2300;

    const maxDim = Math.max(width, height, depth);
    const distance = maxDim * 1.5;

    // Reset Controls Target
    if (this.controls) {
      this.controls.target.set(width / 2, height / 2, depth / 2);
      this.controls.update();
    }

    // Move Camera
    this.camera.position.set(width / 2 + distance, height + distance / 2, depth / 2 + distance);
    this.camera.lookAt(width / 2, height / 2, depth / 2);
  }

  onWindowResize() {
    if (!this.container || !this.renderer) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.requestRender();
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) this.listeners[event].forEach(cb => cb(data));
  }

  getCurrentItem() {
    if (this.currentStep === 0) return null;
    return this.animationSteps[this.currentStep - 1]?.item;
  }

  dispose() {
    this.isPlaying = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.animationInterval) clearTimeout(this.animationInterval);

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    if (this.scene) {
      this.scene.clear();
      this.scene = null;
    }

    if (this.controls) this.controls.dispose();
    this.itemsMap.clear();
    this.animatedItems = [];
    this.listeners = {};
  }
}
