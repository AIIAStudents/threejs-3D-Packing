import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration ---
const CONFIG = {
  colors: {
    background: 0x0f172a, // Deep Slate
    gridMajor: 0x3b82f6,
    gridMinor: 0x1e293b,
    neonEdge: 0xa5f3fc,   // Cyan-ish white
    containerGlass: 0xffffff,
    lights: {
      ambient: 0x475569,
      spot: 0xe0f2fe,
      point: 0x3b82f6
    }
  },
  morandiPalette: [ // Renamed conceptually to 'industrialPalette' but keeping var name for code stability
    0x00d2ff, // Electric Blue
    0x00ff9d, // Neon Green
    0xff9f00, // Safety Orange
    0xff0055, // Hot Pink
    0xf6ff00  // Bright Yellow
  ]
};

class WebGPUViewer {
  constructor() {
    this.container = document.body; // Full screen for now
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.timer = new THREE.Clock();
    this.animatedItems = []; // Store items that need animation

    // Attempt to update UI if present
    this.uiItemCount = document.getElementById('item-count');
  }

  async init() {
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    this.setupLights();
    this.setupControls();
    this.createInfiniteGrid();

    // Resize handler
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Animation Loop
    this.renderer.setAnimationLoop(this.animate.bind(this));

    console.log('WebGPU Viewer Initialized');
  }

  setupRenderer() {
    // Note: Switching to WebGLRenderer for immediate compatibility while keeping high-end PBR materials.
    // WebGPURenderer is currently unstable in some environments without flags.
    // Added logarithmicDepthBuffer: true to fix Z-fighting/flickering on large scales
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.colors.background);

    // Linear Fog instead of Exp2 to prevent color washout at medium distances
    // Starts fading at 40,000 units, completely fogged at 100,000
    this.scene.fog = new THREE.Fog(CONFIG.colors.background, 40000, 100000);
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500000); // 500k Far plane
    this.camera.position.set(4000, 3000, 4000);
    this.camera.lookAt(0, 0, 0);
  }

  setupLights() {
    // 1. Ambient Light (Base visibility) - Increased intensity
    const ambientLight = new THREE.AmbientLight(CONFIG.colors.lights.ambient, 1.2);
    this.scene.add(ambientLight);

    // 2. Main Directional Light (Sun) - Increased intensity
    const dirLight = new THREE.DirectionalLight(CONFIG.colors.lights.spot, 3.0);
    dirLight.position.set(5000, 10000, 5000);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    // ... shadow camera settings same ...
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 20000;
    dirLight.shadow.camera.left = -5000;
    dirLight.shadow.camera.right = 5000;
    dirLight.shadow.camera.top = 5000;
    dirLight.shadow.camera.bottom = -5000;
    this.scene.add(dirLight);

    // 3. Point Lights - Repositioned closer for highlight
    const pointLight1 = new THREE.PointLight(CONFIG.colors.lights.point, 5, 5000);
    pointLight1.position.set(-1000, 2000, -1000);
    this.scene.add(pointLight1);
  }

  setupControls() {
    // Reduced damping for snappier feel
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.2; // Increased from 0.05 to 0.2 for less 'slide'
    this.controls.rotateSpeed = 1.0;
    this.controls.minDistance = 100;
    this.controls.maxDistance = 20000;
  }

  createInfiniteGrid() {
    // Using a large plane with a custom ShaderMaterial to simulate infinite grid
    // For WebGPU, standard NodeMaterial is best, but standard ShaderMaterial works too.
    // Keeping it simple with standard Three.js shader logic for now.

    // 1. Reflective Ground Plane (Glassy Floor)
    const planeGeo = new THREE.PlaneGeometry(100000, 100000);
    const planeMat = new THREE.MeshPhysicalMaterial({
      color: CONFIG.colors.background,
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
    floor.position.y = -20; // Lowered to avoid Z-fighting with container bottom
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. Custom Grid
    // Using widely spaced blue lines for major, subtle grey for minor
    const gridMajor = new THREE.GridHelper(100000, 20, CONFIG.colors.gridMajor, CONFIG.colors.gridMajor);
    gridMajor.position.y = -19; // Just above floor
    gridMajor.material.opacity = 0.3;
    gridMajor.material.transparent = true;
    this.scene.add(gridMajor);

    const gridMinor = new THREE.GridHelper(100000, 1000, CONFIG.colors.gridMinor, CONFIG.colors.gridMinor);
    gridMinor.position.y = -19;
    gridMinor.material.opacity = 0.1;
    gridMinor.material.transparent = true;
    this.scene.add(gridMinor);
  }

  // --- Core Logic: Loading Data ---
  loadPackingData(data) {
    // Clear previous
    // ... cleanup logic omitted for brevity in this step ...

    if (data.container) this.createGlassContainer(data.container);
    if (data.items) this.createStyledBoxes(data.items);
  }

  createGlassContainer(config) {
    const width = config.widthX || 5800;
    const height = config.heightY || 2400;
    const depth = config.depthZ || 2300;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Move origin to bottom-left-back corner if needed, or keeping center
    // Standard Three.js box is centered. We usually want to sit on floor.
    geometry.translate(width / 2, height / 2, depth / 2);

    // High Tech Glass Material
    const material = new THREE.MeshPhysicalMaterial({
      color: CONFIG.colors.containerGlass,
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.9,  // Glass-like transmission
      thickness: 10.0,    // Refraction volume
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide // Render inside
    });

    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);

    // Container Edges (Glowing Frame)
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    this.scene.add(wireframe);
  }

  createStyledBoxes(items) {
    if (this.uiItemCount) this.uiItemCount.textContent = items.length;

    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

    items.forEach((item, index) => {
      const { min, max } = item.pose || { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } };
      const w = max.x - min.x;
      const h = max.y - min.y;
      const d = max.z - min.z;

      // Target Position
      const targetX = (min.x + max.x) / 2;
      const targetY = (min.y + max.y) / 2;
      const targetZ = (min.z + max.z) / 2;

      // Morandi/Industrial Color
      const color = CONFIG.morandiPalette[index % CONFIG.morandiPalette.length];

      // Material
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.3,
        metalness: 0.1
      });

      const mesh = new THREE.Mesh(boxGeometry, material);

      // -- Animation Setup --
      // Start 500 units above
      const startY = targetY + 800; // Drop from higher up
      mesh.position.set(targetX, startY, targetZ);
      mesh.scale.set(w, h, d);

      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Store Animation Data
      mesh.userData = {
        targetY: targetY,
        currentY: startY,
        velocity: 0,
        // Stagger: Index * 100ms
        startTime: performance.now() + (index * 150),
        isLanded: false
      };

      this.scene.add(mesh);
      this.animatedItems.push(mesh); // Add to animation loop

      // Neon Edges
      const edgesGeo = new THREE.EdgesGeometry(boxGeometry);
      const edgeMat = new THREE.LineBasicMaterial({
        color: CONFIG.colors.neonEdge,
        transparent: true,
        opacity: 0.6,
        linewidth: 2
      });
      const edges = new THREE.LineSegments(edgesGeo, edgeMat);
      mesh.add(edges);
    });
  }

  updateAnimations() {
    const now = performance.now();
    const damping = 0.1; // Smoothness

    this.animatedItems.forEach(mesh => {
      if (mesh.userData.isLanded) return;
      if (now < mesh.userData.startTime) return;

      const data = mesh.userData;

      // Simple Lerp approach for "Magnetic Snap" feel
      // (Target - Current) * Factor
      const diff = data.targetY - mesh.position.y;

      if (Math.abs(diff) < 0.5) {
        // Snap to finish
        mesh.position.y = data.targetY;
        data.isLanded = true;
      } else {
        // Move towards target
        // Nonlinear ease-out
        mesh.position.y += diff * 0.08;
      }
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    this.updateAnimations(); // Process animations
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Start
const viewer = new WebGPUViewer();
viewer.init().then(() => {
  // Test Data
  const mockData = {
    container: { widthX: 5800, heightY: 2400, depthZ: 2300 },
    items: [
      { pose: { min: { x: 0, y: 0, z: 0 }, max: { x: 1000, y: 1000, z: 1000 } } },
      { pose: { min: { x: 1000, y: 0, z: 0 }, max: { x: 2000, y: 500, z: 500 } } },
      { pose: { min: { x: 0, y: 0, z: 1000 }, max: { x: 800, y: 800, z: 1800 } } }
    ]
  };
  viewer.loadPackingData(mockData);
});
