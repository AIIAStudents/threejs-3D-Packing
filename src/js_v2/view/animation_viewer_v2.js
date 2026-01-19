import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
  }

  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLights();
    this.setupControls();
    this.createInfiniteGrid();

    // Resize Handler
    window.addEventListener('resize', () => this.onWindowResize());

    // Animation Loop
    this.animate();

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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 20000;
    dirLight.shadow.camera.left = -5000;
    dirLight.shadow.camera.right = 5000;
    dirLight.shadow.camera.top = 5000;
    dirLight.shadow.camera.bottom = -5000;
    this.scene.add(dirLight);

    // 3. Point Light (Sparkle)
    const pointLight = new THREE.PointLight(this.CONFIG.colors.lights.point, 5, 5000);
    pointLight.position.set(-1000, 2000, -1000);
    this.scene.add(pointLight);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.2; // Snappier
    this.controls.minDistance = 100;
    this.controls.maxDistance = 20000;
  }

  createInfiniteGrid() {
    // 1. Reflective Floor
    const planeGeo = new THREE.PlaneGeometry(100000, 100000);
    const planeMat = new THREE.MeshPhysicalMaterial({
      color: this.CONFIG.colors.background,
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
    requestAnimationFrame(() => this.animate());

    this.updateDropAnimations();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateDropAnimations() {
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
      }
    });
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

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Animation Data
    mesh.userData = {
      targetY: targetY,
      isLanded: false
    };

    // Neon Edges
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
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
    this.reset(); // Easiest way is to reset visuals

    // Fast forward add
    // Ideally we skip animation for seek, just place them directly
    for (let i = 0; i < target; i++) {
      this.renderItemInstant(i); // New instant method
    }
    this.currentStep = target;
    this.emit('stepChange', { step: this.currentStep, total: this.totalSteps });
  }

  renderItemInstant(index) {
    // Same as renderItem but placed at targetY immediately
    const step = this.animationSteps[index];
    if (!step) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const color = this.CONFIG.industrialPalette[index % this.CONFIG.industrialPalette.length];
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(step.size.w, step.size.h, step.size.d);
    mesh.position.set(step.position.x, step.position.y, step.position.z);
    mesh.userData = { isLanded: true, targetY: step.position.y }; // Already there

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: this.CONFIG.colors.neonEdge, transparent: true, opacity: 0.6 })
    );
    mesh.add(edges);

    this.scene.add(mesh);
    this.itemsMap.set(index, mesh);
    this.animatedItems.push(mesh); // Still add to update list but it won't move
  }

  createGlassContainer(config) {
    const width = config.widthX || 5800;
    const height = config.heightY || 2400;
    const depth = config.depthZ || 2300;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(width / 2, height / 2, depth / 2);

    const material = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6, // Slight blue tint
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.9,
      thickness: 10.0,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });

    this.containerMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.containerMesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    );
    this.containerMesh.add(edges); // Attach to mesh for easier cleanup
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
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
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
}
