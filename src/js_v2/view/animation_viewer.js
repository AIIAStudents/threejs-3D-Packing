import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RenderManager, QualityScaler } from './performance_utils.js';

/**
 * AnimationViewer - Performance Optimized 3D Animation Controller
 * Features: Render-on-Demand + Dynamic Quality Scaling + Lifecycle Management
 */
export class AnimationViewer {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Animation state
    this.animationSteps = [];
    this.currentStep = 0;
    this.totalSteps = 0;
    this.isPlaying = false;
    this.speed = 1.0;
    this.animationInterval = null;

    // Scene objects
    this.containerMesh = null;
    this.zonesMeshes = [];
    this.itemsMeshes = [];

    // Event listeners
    this.listeners = {};

    // Performance managers
    this.renderManager = null;
    this.qualityScaler = null;

    // Lifecycle
    this.isDisposed = false;
    this._boundResizeHandler = null;
  }

  init() {
    if (this.isDisposed) {
      console.warn('[AnimationViewer] Cannot init disposed viewer');
      return;
    }

    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLights();
    this.setupControls();
    this.setupPerformanceManagers();

    console.log('[AnimationViewer] Initialized with render-on-demand');
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    // Subtle Grid Helper
    const gridHelper = new THREE.GridHelper(10000, 100, 0x3b82f6, 0x334155);
    gridHelper.position.y = -5;
    this.scene.add(gridHelper);
  }

  setupCamera() {
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      1,
      500000
    );
    this.camera.position.set(3000, 3000, 3000);
    this.camera.lookAt(0, 0, 0);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Bind resize handler
    this._boundResizeHandler = this.onWindowResize.bind(this);
    window.addEventListener('resize', this._boundResizeHandler);
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(2000, 4000, 2000);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.5);
    this.scene.add(hemiLight);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // CRITICAL: Decouple controls events
    this.controls.addEventListener('start', () => this.onInteractionStart());
    this.controls.addEventListener('change', () => this.onControlsChange());
    this.controls.addEventListener('end', () => this.onInteractionEnd());
  }

  setupPerformanceManagers() {
    // Render-on-Demand Manager
    this.renderManager = new RenderManager(() => this.render());

    // Quality Scaler
    this.qualityScaler = new QualityScaler(this.renderer);

    // Initial render
    this.renderManager.requestRender();
  }

  /**
   * Interaction Handlers
   */
  onInteractionStart() {
    console.log('[AnimationViewer] Interaction START - lowering quality');
    this.qualityScaler.onInteractionStart(() => this.renderManager.requestRender());
  }

  onControlsChange() {
    // Only mark dirty and request render - NO heavy work here
    this.renderManager.requestRender();
  }

  onInteractionEnd() {
    console.log('[AnimationViewer] Interaction END - restoring quality');
    this.qualityScaler.onInteractionEnd(() => this.renderManager.requestRender());
  }

  /**
   * Single render call (no continuous loop)
   */
  render() {
    if (this.isDisposed) return;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    if (this.isDisposed) return;

    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderManager.requestRender();
  }

  // Load animation data
  loadAnimation(data) {
    console.log('[AnimationViewer] Loading animation data:', data);

    // Clear existing objects
    this.clearScene();

    // Draw container
    if (data.container) {
      this.drawContainer(data.container);
    }

    // Draw zones (semi-transparent)
    if (data.zones) {
      this.drawZones(data.zones);
    }

    // Prepare animation steps
    this.prepareAnimationSteps(data.items);

    // Adjust camera
    this.fitCamera(data.container);

    console.log(`[AnimationViewer] Animation loaded: ${this.totalSteps} steps`);
    this.renderManager.requestRender();
  }

  prepareAnimationSteps(items) {
    this.animationSteps = items.map((item, index) => ({
      stepNumber: index + 1,
      item: item,
      startPosition: this.calculateStartPosition(item),
      endPosition: this.calculateEndPosition(item)
    }));

    this.totalSteps = this.animationSteps.length;
    this.currentStep = 0;
  }

  calculateStartPosition(item) {
    const endPos = this.calculateEndPosition(item);
    return {
      x: endPos.x,
      y: 3000, // High above
      z: endPos.z
    };
  }

  calculateEndPosition(item) {
    if (!item.pose) return { x: 0, y: 0, z: 0 };

    const { min, max } = item.pose;
    const zoneOffset = item.zoneOffset || { x: 0, y: 0 };

    return {
      x: (min.x + max.x) / 2 + zoneOffset.x,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2 + zoneOffset.y
    };
  }

  // Drawing methods
  drawContainer(config) {
    const shape = config.shape || 'rect';

    console.log('[AnimationViewer] Drawing container with shape:', shape, config);

    switch (shape) {
      case 'u_shape':
        this.drawUShapeContainer(config);
        break;
      case 't_shape':
        this.drawTShapeContainer(config);
        break;
      case 'rect':
      default:
        this.drawRectContainer(config);
        break;
    }
  }

  drawRectContainer(config) {
    const width = config.widthX || config.parameters?.widthX || 5800;
    const height = config.heightY || config.parameters?.heightY || 2400;
    const depth = config.depthZ || config.parameters?.depthZ || 2300;

    console.log('[AnimationViewer] Drawing rectangular container:', { width, height, depth });

    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(width / 2, height / 2, depth / 2);

    // Semi-transparent container body
    const material = new THREE.MeshBasicMaterial({
      color: 0xc4a57b,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, 0);
    this.scene.add(mesh);
    this.containerMesh = mesh;

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x8b6f47, linewidth: 2 })
    );
    line.position.set(0, 0, 0);

    this.scene.add(line);
  }

  drawUShapeContainer(config) {
    const outerWidth = config.outerWidthX || config.parameters?.outerWidthX || 5800;
    const outerDepth = config.outerDepthZ || config.parameters?.outerDepthZ || 2300;
    const gapWidth = config.gapWidthX || config.parameters?.gapWidthX || 1000;
    const gapDepth = config.gapDepthZ || config.parameters?.gapDepthZ || 800;
    const height = config.heightY || config.parameters?.heightY || 2400;

    console.log('[AnimationViewer] Drawing U-shape container:', { outerWidth, outerDepth, gapWidth, gapDepth, height });

    // Create U-shape using Shape
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

    // Semi-transparent U-shape body
    const material = new THREE.MeshBasicMaterial({
      color: 0xc4a57b,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    this.containerMesh = mesh;

    // Edges
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x8b6f47, linewidth: 2 })
    );
    this.scene.add(line);
  }

  drawTShapeContainer(config) {
    const topWidth = config.topWidthX || config.parameters?.topWidthX || 4000;
    const bottomWidth = config.bottomWidthX || config.parameters?.bottomWidthX || 1500;
    const topDepth = config.topDepthZ || config.parameters?.topDepthZ || 1500;
    const bottomDepth = config.bottomDepthZ || config.parameters?.bottomDepthZ || 4000;
    const height = config.heightY || config.parameters?.heightY || 2400;

    console.log('[AnimationViewer] Drawing T-shape container:', { topWidth, bottomWidth, topDepth, bottomDepth, height });

    // Create T-shape using Shape
    const shape = new THREE.Shape();

    // Calculate positions for T-shape
    const leftEdge = (topWidth - bottomWidth) / 2;
    const rightEdge = leftEdge + bottomWidth;

    // Draw T-shape clockwise from bottom-left
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

    // Semi-transparent T-shape body
    const material = new THREE.MeshBasicMaterial({
      color: 0xc4a57b,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    this.containerMesh = mesh;

    // Edges
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x8b6f47, linewidth: 2 })
    );
    this.scene.add(line);
  }

  drawZones(zones) {
    zones.forEach((zone, index) => {
      const width = zone.length || 1000;
      const height = zone.height || 2400;
      const depth = zone.width || 1000;

      const cornerX = zone.x || 0;
      const cornerZ = zone.y || 0;

      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshBasicMaterial({
        color: this.getZoneColor(index),
        transparent: true,
        opacity: 0.1
      });
      const mesh = new THREE.Mesh(geometry, material);

      const centerX = cornerX + width / 2;
      const centerY = height / 2;
      const centerZ = cornerZ + depth / 2;

      mesh.position.set(centerX, centerY, centerZ);

      this.scene.add(mesh);
      this.zonesMeshes.push(mesh);
    });
  }

  getZoneColor(index) {
    const colors = [0xff6b9d, 0x6bcf7f, 0x6ba3ff, 0xffb66b];
    return colors[index % colors.length];
  }

  // Animation playback
  play() {
    if (this.isPlaying) return;
    if (this.currentStep >= this.totalSteps) {
      this.reset();
    }

    this.isPlaying = true;
    this.playNextStep();
  }

  pause() {
    this.isPlaying = false;
    if (this.animationInterval) {
      clearTimeout(this.animationInterval);
      this.animationInterval = null;
    }
  }

  reset() {
    this.pause();
    this.currentStep = 0;

    // Remove all item meshes
    this.itemsMeshes.forEach(mesh => this.scene.remove(mesh));
    this.itemsMeshes = [];

    this.emit('stepChange', { step: 0, total: this.totalSteps });
    this.renderManager.requestRender();
  }

  nextStep() {
    if (this.currentStep < this.totalSteps) {
      this.renderStep(this.currentStep);
      this.currentStep++;
      this.emit('stepChange', { step: this.currentStep, total: this.totalSteps });
    }
  }

  previousStep() {
    if (this.currentStep > 0) {
      const lastMesh = this.itemsMeshes.pop();
      if (lastMesh) {
        this.scene.remove(lastMesh);
      }

      this.currentStep--;
      this.emit('stepChange', { step: this.currentStep, total: this.totalSteps });
      this.renderManager.requestRender();
    }
  }

  playNextStep() {
    if (!this.isPlaying || this.currentStep >= this.totalSteps) {
      if (this.currentStep >= this.totalSteps) {
        this.emit('animationComplete');
      }
      this.isPlaying = false;
      return;
    }

    this.animateStep(this.currentStep, () => {
      this.currentStep++;
      this.emit('stepChange', { step: this.currentStep, total: this.totalSteps });

      const delay = 500 / this.speed;
      this.animationInterval = setTimeout(() => this.playNextStep(), delay);
    });
  }

  animateStep(stepIndex, onComplete) {
    const step = this.animationSteps[stepIndex];
    if (!step) {
      onComplete();
      return;
    }

    const item = step.item;
    const mesh = this.createItemMesh(item);

    mesh.position.set(step.startPosition.x, step.startPosition.y, step.startPosition.z);
    this.scene.add(mesh);
    this.itemsMeshes.push(mesh);

    // Animate to end position
    this.tweenPosition(mesh, step.endPosition, 800 / this.speed, onComplete);
  }

  renderStep(stepIndex) {
    const step = this.animationSteps[stepIndex];
    if (!step) return;

    const item = step.item;
    const mesh = this.createItemMesh(item);

    mesh.position.set(step.endPosition.x, step.endPosition.y, step.endPosition.z);
    this.scene.add(mesh);
    this.itemsMeshes.push(mesh);
    this.renderManager.requestRender();
  }

  createItemMesh(item) {
    if (!item.pose) return new THREE.Mesh();

    const { min, max } = item.pose;
    const width = max.x - min.x;
    const height = max.y - min.y;
    const depth = max.z - min.z;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshPhongMaterial({
      color: 0x4caf50,
      transparent: true,
      opacity: 0.8
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x2e7d32 })
    );
    mesh.add(line);

    return mesh;
  }

  // Tween animation
  tweenPosition(object, targetPos, duration, onComplete) {
    const startPos = {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z
    };

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-in-out
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      object.position.x = startPos.x + (targetPos.x - startPos.x) * eased;
      object.position.y = startPos.y + (targetPos.y - startPos.y) * eased;
      object.position.z = startPos.z + (targetPos.z - startPos.z) * eased;

      this.renderManager.requestRender();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        if (onComplete) onComplete();
      }
    };

    animate();
  }

  setSpeed(speed) {
    this.speed = speed;
    console.log(`[AnimationViewer] Speed set to ${speed}x`);
  }

  seekToPercent(percent) {
    const targetStep = Math.floor(this.totalSteps * percent);
    this.seekToStep(targetStep);
  }

  seekToStep(targetStep) {
    this.pause();

    // Remove all items
    this.itemsMeshes.forEach(mesh => this.scene.remove(mesh));
    this.itemsMeshes = [];

    // Render all steps up to target
    for (let i = 0; i < targetStep; i++) {
      this.renderStep(i);
    }

    this.currentStep = targetStep;
    this.emit('stepChange', { step: this.currentStep, total: this.totalSteps });
  }

  getCurrentItem() {
    if (this.currentStep === 0) return null;
    const step = this.animationSteps[this.currentStep - 1];
    return step ? step.item : null;
  }

  fitCamera(container) {
    if (!container) return;

    const width = container.widthX || container.parameters?.widthX || 5800;
    const height = container.heightY || container.parameters?.heightY || 2400;
    const depth = container.depthZ || container.parameters?.depthZ || 2300;

    const maxDim = Math.max(width, height, depth);
    const distance = maxDim * 1.5;

    this.camera.position.set(distance, distance * 0.7, distance);
    this.camera.lookAt(width / 2, height / 2, depth / 2);
    this.renderManager.requestRender();
  }

  clearScene() {
    // Remove container
    if (this.containerMesh) {
      this.scene.remove(this.containerMesh);
      this.containerMesh = null;
    }

    // Remove zones
    this.zonesMeshes.forEach(mesh => this.scene.remove(mesh));
    this.zonesMeshes = [];

    // Remove items
    this.itemsMeshes.forEach(mesh => this.scene.remove(mesh));
    this.itemsMeshes = [];
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  /**
   * CRITICAL: Dispose method for SPA lifecycle
   */
  dispose() {
    console.log('[AnimationViewer] Disposing...');

    this.isDisposed = true;
    this.pause();

    // Remove event listeners
    if (this._boundResizeHandler) {
      window.removeEventListener('resize', this._boundResizeHandler);
      this._boundResizeHandler = null;
    }

    // Dispose controls
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    // Dispose performance managers
    if (this.qualityScaler) {
      this.qualityScaler.dispose();
      this.qualityScaler = null;
    }

    // Clear scene
    this.clearScene();

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }

    // Clear listeners
    this.listeners = {};

    console.log('[AnimationViewer] Disposed');
  }
}
