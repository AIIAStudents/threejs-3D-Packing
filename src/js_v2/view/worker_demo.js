import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- Configuration ---
const DEMO_ITEM_COUNT = 5000;
const CONTAINER_SIZE = { width: 2000, height: 2000, depth: 2000 };

// --- Global State ---
let scene, camera, renderer, controls;
let worker;
let instancedMesh; // The efficient mesh for thousands of boxes
let loadingSpinner;

// --- Initialization ---
// --- Initialization ---
// init() removed - handled by DirectModuleLoader

// Export as a class or object for DirectModuleLoader
export const WorkerDemo = {
  init() {
    console.log('[WorkerDemo] Initializing...');

    // Cleanup if re-initializing
    if (this.worker) {
      this.worker.terminate();
    }
    if (this.renderer) {
      this.renderer.dispose();
    }

    this.setupUI();
    this.setupScene();
    this.setupWorker();

    this.renderRequested = false;
    this.requestRender();
  },

  setupUI() {
    const btn = document.getElementById('btn-start-packing');
    this.loadingSpinner = document.getElementById('loading-spinner');

    if (btn) {
      // Clone to remove old listeners if any (simple hack for no-cleanup architecture)
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', () => {
        this.startPackingProcess();
      });
    }
  },

  setupScene() {
    const canvas = document.getElementById('demo-canvas');
    if (!canvas) {
      console.error('Canvas #demo-canvas not found!');
      return;
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e); // Dark Blue

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(2500, 2500, 2500);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1000, 2000, 1000);
    scene.add(dirLight);

    // Controls
    controls = new OrbitControls(camera, canvas);
    controls.addEventListener('change', () => this.requestRender());

    // Helpers (Container Wireframe)
    const geometry = new THREE.BoxGeometry(CONTAINER_SIZE.width, CONTAINER_SIZE.height, CONTAINER_SIZE.depth);
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x4cc9f0 }));
    line.position.set(CONTAINER_SIZE.width / 2, CONTAINER_SIZE.height / 2, CONTAINER_SIZE.depth / 2);
    scene.add(line);

    window.addEventListener('resize', () => {
      this.onWindowResize();
      this.requestRender();
    }, false);
  },

  setupWorker() {
    // Create the worker
    // Use absolute path from project root for Vite
    this.worker = new Worker('/src/js_v2/workers/packing.worker.js');
    worker = this.worker; // keep global ref if needed for closures, but better to use this.worker

    // Listener for result
    this.worker.onmessage = (e) => {
      const { type, results, stats } = e.data;

      if (type === 'PACKING_COMPLETE') {
        console.log(`[Main] Packing complete! Time: ${stats.timeMs}ms, Items: ${stats.itemCount}`);
        this.renderResults(results);

        // UI Updates
        if (this.loadingSpinner) this.loadingSpinner.style.display = 'none';
        if (statusText) statusText.innerText = `Done! Packed ${stats.itemCount} items in ${stats.timeMs.toFixed(0)}ms`;

        this.requestRender();
      }
    };
  },

  startPackingProcess() {
    // 1. Prepare Data
    console.log('[Main] Generating dummy data...');
    const items = [];
    for (let i = 0; i < DEMO_ITEM_COUNT; i++) {
      items.push({
        id: `box_${i}`,
        width: 50 + Math.random() * 50,
        height: 50 + Math.random() * 50,
        depth: 50 + Math.random() * 50,
        color: Math.random() * 0xffffff
      });
    }

    // 2. UI Updates (Show loading)
    if (this.loadingSpinner) this.loadingSpinner.style.display = 'block';
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.innerText = 'Calculating in Worker...';

    // 3. Send to Worker
    this.worker.postMessage({
      type: 'START_PACKING',
      items: items,
      container: CONTAINER_SIZE
    });
  },

  renderResults(packedItems) {
    if (instancedMesh) {
      scene.remove(instancedMesh);
      instancedMesh.dispose();
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff }); // Color will be set per instance

    instancedMesh = new THREE.InstancedMesh(geometry, material, packedItems.length);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Optional optimization hint

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < packedItems.length; i++) {
      const item = packedItems[i];
      dummy.position.set(
        item.x + item.width / 2,
        item.y + item.height / 2,
        item.z + item.depth / 2
      );
      dummy.scale.set(item.width, item.height, item.depth);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      color.setHex(item.color || 0x00ff00);
      instancedMesh.setColorAt(i, color);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.instanceColor.needsUpdate = true;
    scene.add(instancedMesh);
  },

  onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  },

  animate() {
    // Render-on-demand
    if (!this.renderRequested) return;
    this.renderRequested = false;

    if (!this.renderer) return;

    if (controls) controls.update();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  },

  requestRender() {
    if (!this.renderRequested) {
      this.renderRequested = true;
      requestAnimationFrame(() => this.animate());
    }
  }
};

export default WorkerDemo;
