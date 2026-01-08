import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * AnimationViewer - 3D Animation Controller
 * Handles step-by-step animation of packing process
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
  }

  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLights();
    this.setupControls();
    this.animate();

    console.log('[AnimationViewer] Initialized');
  }

  setupScene() {
    this.scene = new THREE.Scene();
    // Explicit Dark Background (Deep Slate)
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
    this.renderer = new THREE.WebGLRenderer({ antialias: true }); // No alpha needed if we set BG
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Handle resize
    window.addEventListener('resize', () => this.onWindowResize());
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
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
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
    // Start position: above the container
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
    const width = config.widthX || config.parameters?.widthX || 5800;
    const height = config.heightY || config.parameters?.heightY || 2400;
    const depth = config.depthZ || config.parameters?.depthZ || 2300;

    console.log('[AnimationViewer] Drawing container:', { width, height, depth });

    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(width / 2, height / 2, depth / 2);

    // Create semi-transparent container body
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, 0); // Explicitly set to origin
    this.scene.add(mesh);
    this.containerMesh = mesh; // Store mesh instead of just lines for better visibility

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.3 })
    );
    line.position.set(0, 0, 0);

    this.scene.add(line);
    // this.containerMesh = line; // We're using the mesh body now

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
        opacity: 0.1,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geometry, material);

      const centerX = cornerX + width / 2;
      const centerY = height / 2;
      const centerZ = cornerZ + depth / 2;

      mesh.position.set(centerX, centerY, centerZ);

      // Add dashed edges for zones
      const edges = new THREE.EdgesGeometry(geometry);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: this.getZoneColor(index), transparent: true, opacity: 0.4 })
      );
      mesh.add(line);

      this.scene.add(mesh);
      this.zonesMeshes.push(mesh);
    });
  }

  getZoneColor(index) {
    const colors = [0x3b82f6, 0x10b981, 0xf97316, 0x8b5cf6];
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
      // Remove last item
      const lastMesh = this.itemsMeshes.pop();
      if (lastMesh) {
        this.scene.remove(lastMesh);
      }

      this.currentStep--;
      this.emit('stepChange', { step: this.currentStep, total: this.totalSteps });
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

      // Schedule next step
      const delay = 500 / this.speed; // Base delay 500ms
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

    // Set start position
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

    // Set final position directly (no animation)
    mesh.position.set(step.endPosition.x, step.endPosition.y, step.endPosition.z);
    this.scene.add(mesh);
    this.itemsMeshes.push(mesh);
  }

  createItemMesh(item) {
    if (!item.pose) return new THREE.Mesh();

    const { min, max } = item.pose;
    const width = max.x - min.x;
    const height = max.y - min.y;
    const depth = max.z - min.z;

    const geometry = new THREE.BoxGeometry(width, height, depth);

    // Holographic Style Material
    const material = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,      // Cyan 500
      transparent: true,
      opacity: 0.9,
      roughness: 0.1,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Add Bright White Edges
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, linewidth: 2 })
    );
    mesh.add(line);

    return mesh;
  }

  // Simple tween animation
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

      // Easing function (ease-in-out)
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      object.position.x = startPos.x + (targetPos.x - startPos.x) * eased;
      object.position.y = startPos.y + (targetPos.y - startPos.y) * eased;
      object.position.z = startPos.z + (targetPos.z - startPos.z) * eased;

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

    const width = container.widthX || 5800;
    const height = container.heightY || 2400;
    const depth = container.depthZ || 2300;

    const maxDim = Math.max(width, height, depth);
    const distance = maxDim * 1.5;

    this.camera.position.set(distance, distance * 0.7, distance);
    this.camera.lookAt(width / 2, height / 2, depth / 2);
  }

  clearScene() {
    // Remove container
    if (this.containerMesh) {
      this.scene.remove(this.containerMesh);
      // Also remove the line helper if it was added separately, but since we didn't store it in a separate var, 
      // we need to be careful. In drawContainer, we added both.
      // Let's rely on scene.clear() pattern or tracking all objects.
      // For now, let's just clear all children of scene except lights/grid if we want to be thorough,
      // but to stick to the pattern:

      // Actually, my previous drawContainer added mesh AND line, but only stored one in this.containerMesh.
      // This causes memory leaks/artifacts. Fixing clean up strategy.

      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0]);
      }
      // Re-setup static scene elements (Lights + Grid)
      this.setupLights();

      const gridHelper = new THREE.GridHelper(10000, 100, 0x3b82f6, 0x334155);
      gridHelper.position.y = -5;
      this.scene.add(gridHelper);


      this.containerMesh = null;
    } else {
      // Just clear arrays
      this.zonesMeshes.forEach(mesh => this.scene.remove(mesh));
      this.itemsMeshes.forEach(mesh => this.scene.remove(mesh));
    }

    this.zonesMeshes = [];
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
}
