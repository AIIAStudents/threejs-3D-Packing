/*
    File: three_viewer.js
    Description: Three.js 3D visualization module for packing results
*/

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class ThreeViewer {
  constructor(containerElement) {
    this.container = containerElement;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.animationId = null;
    this.renderRequested = false;
    this.isFullscreen = false;

    // Visibility states
    this.visibility = {
      container: true,
      zones: true,
      items: true
    };

    // Store references to scene objects
    this.sceneObjects = {
      container: [],
      zones: [],
      items: [] // No longer used for meshes, but maybe for raycasting later
    };

    this.instancedMesh = null;
    this.worker = null;
  }

  init() {
    // 1. Critical Path: Renderer & Camera
    this.initRenderer();

    // 2. Defer Heavy Setup
    // Execute immediately to ensure lights are ready before content loads
    this.initSceneObjects();
  }

  initRenderer() {
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();

    // Minimal Scene for first frame
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);

    // 2. Setup Worker (Immediate to avoid race condition)
    this.setupWorker();

    // Start loop immediately so canvas appears
    this.animate();

    // Handle window resize
    this._resizeHandler = this.onWindowResize.bind(this);
    window.addEventListener('resize', this._resizeHandler);
  }

  initSceneObjects() {
    // Check if checks/setup already done
    if (this.isSceneReady) return;

    this.setupLights();
    this.setupEnvironment(); // Floor, Grid, Fog
    // Worker moved to initRenderer

    this.isSceneReady = true;
    console.log('[ThreeViewer] Full scene initialized (deferred)');
  }

  setupWorker() {
    try {
      this.worker = new Worker('/src/js_v2/workers/geometry_builder.worker.js');
      this.worker.onmessage = (e) => this.handleWorkerMessage(e);
      console.log('[ThreeViewer] Worker initialized');
    } catch (err) {
      console.error('[ThreeViewer] Failed to init worker:', err);
    }
  }

  handleWorkerMessage(e) {
    const { type, matrices, colors, count, message } = e.data;

    if (type === 'GEOMETRY_BUILT') {
      console.log(`[ThreeViewer] Worker returned ${count} items`);
      this.updateInstancedMesh(matrices, colors, count);
    } else if (type === 'ERROR') {
      console.error('[ThreeViewer] Worker error:', message);
    }
  }

  setupEnvironment() {
    if (!this.scene) return;

    // Linear Fog
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
  }

  setupCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    // Fix: Increase far clipping plane to 500000
    this.camera = new THREE.PerspectiveCamera(60, aspect, 1, 500000);
    this.camera.position.set(4000, 3000, 4000);
    this.camera.lookAt(0, 0, 0);
  }

  setupRenderer() {
    // Standard Renderer settings
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true }); // fixed z-fighting
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.2; // Snappier
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 100;
    this.controls.maxDistance = 20000;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent going below ground

    // Render on interaction
    this.controls.addEventListener('change', () => this.requestRender());
  }

  setupLights() {
    // 1. Ambient Light
    const ambientLight = new THREE.AmbientLight(0x475569, 1.2);
    this.scene.add(ambientLight);

    // 2. Main Directional Light
    const dirLight = new THREE.DirectionalLight(0xe0f2fe, 3.0);
    dirLight.position.set(5000, 10000, 5000);
    dirLight.castShadow = true;
    // Optimize shadow map
    dirLight.shadow.mapSize.width = 4096; // Higher res for big scene
    dirLight.shadow.mapSize.height = 4096;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 20000;
    dirLight.shadow.camera.left = -10000;
    dirLight.shadow.camera.right = 10000;
    dirLight.shadow.camera.top = 10000;
    dirLight.shadow.camera.bottom = -10000;
    this.scene.add(dirLight);

    // 3. Point Lights
    const pointLight1 = new THREE.PointLight(0x3b82f6, 5, 5000);
    pointLight1.position.set(-1000, 2000, -1000);
    this.scene.add(pointLight1);
  }

  animate() {
    // Render-on-demand: only render if requested
    if (!this.renderRequested) return;

    this.renderRequested = false;

    if (this.controls) this.controls.update();

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  requestRender() {
    if (!this.renderRequested) {
      this.renderRequested = true;
      requestAnimationFrame(() => this.animate());
    }
  }

  onWindowResize() {
    if (this.isFullscreen) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    } else {
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  clearScene() {
    // Clear InstancedMesh
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
      this.instancedMesh.geometry.dispose();
      this.instancedMesh.material.dispose();
      this.instancedMesh = null;
    }

    // Clear previous content using the references we stored
    [...this.sceneObjects.container, ...this.sceneObjects.zones, ...this.sceneObjects.items].forEach(obj => {
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    // Clear object references
    this.sceneObjects.container = [];
    this.sceneObjects.zones = [];
    this.sceneObjects.items = [];

    this.requestRender();
  }

  loadPackingResult(packingData) {
    console.log('[ThreeViewer] Loading packing result:', packingData);
    this.clearScene();

    // Store container config for zone validation
    this.containerConfig = packingData.container;

    if (packingData.container) {
      this.drawContainer(packingData.container);
    }

    if (packingData.zones && packingData.zones.length > 0) {
      // CRITICAL FIX: Validate and clamp zones to container bounds before rendering
      console.log('[ThreeViewer] Validating zones against container bounds...');
      const validatedZones = packingData.zones.map(zone => this.clampZoneToContainer(zone));
      this.drawZones(validatedZones);
    }

    if (packingData.items && packingData.items.length > 0) {
      this.drawItems(packingData.items);
    } else {
      // If no items, we might still want to fit camera to container
      this.fitCameraToScene();
    }
  }

  // Clamp zone to container bounds (copied from cut_container_v2.js logic)
  clampZoneToContainer(zone) {
    const config = this.containerConfig;
    if (!config) return zone;

    const halfW = (zone.length || zone.width) / 2;
    const halfH = (zone.width || zone.height) / 2;

    // Check if zone is within bounds
    const corners = [
      { x: zone.x - halfW, y: zone.y - halfH },
      { x: zone.x + halfW, y: zone.y - halfH },
      { x: zone.x + halfW, y: zone.y + halfH },
      { x: zone.x - halfW, y: zone.y + halfH },
    ];

    const allInside = corners.every(c => this.isPointInContainer(c.x, c.y));

    if (allInside) {
      return zone; // Already within bounds
    }

    console.warn('[ThreeViewer] Zone extends outside container, clamping:', zone);

    const clampedZone = { ...zone };
    const zoneWidth = zone.length || zone.width || 1000;
    const zoneDepth = zone.width || zone.height || 1000;

    switch (config.shape) {
      case 'u_shape': {
        const { outerWidthX, outerDepthZ, gapWidthX, gapDepthZ } = config;
        const gapLeft = (outerWidthX - gapWidthX) / 2;
        const gapRight = (outerWidthX + gapWidthX) / 2;
        const gapTop = outerDepthZ - gapDepthZ;

        // Clamp to outer bounds
        clampedZone.x = Math.max(halfW, Math.min(outerWidthX - halfW, zone.x));
        clampedZone.y = Math.max(halfH, Math.min(outerDepthZ - halfH, zone.y));

        // CRITICAL FIX: Only move zone if its CENTER is in the gap
        const centerInGap = (
          zone.x >= gapLeft && zone.x <= gapRight &&
          zone.y >= gapTop && zone.y <= outerDepthZ
        );

        if (centerInGap) {
          const distToLeft = Math.abs(zone.x - gapLeft);
          const distToRight = Math.abs(zone.x - gapRight);
          clampedZone.x = distToLeft < distToRight ? gapLeft - halfW : gapRight + halfW;
          clampedZone.y = Math.min(zone.y, gapTop - halfH);
        }
        break;
      }

      case 't_shape': {
        const { topWidthX, topDepthZ, bottomWidthX, bottomDepthZ } = config;
        const bottomLeft = (topWidthX - bottomWidthX) / 2;
        const bottomRight = bottomLeft + bottomWidthX;

        // CRITICAL FIX: Check if zone center is in valid T-shape region
        const centerInBottom = (
          zone.y >= 0 && zone.y <= bottomDepthZ &&
          zone.x >= bottomLeft && zone.x <= bottomRight
        );

        const centerInTop = (
          zone.y > bottomDepthZ && zone.y <= bottomDepthZ + topDepthZ &&
          zone.x >= 0 && zone.x <= topWidthX
        );

        if (centerInBottom) {
          // Bottom area
          clampedZone.x = Math.max(bottomLeft + halfW, Math.min(bottomRight - halfW, zone.x));
          clampedZone.y = Math.max(halfH, Math.min(bottomDepthZ - halfH, zone.y));
        } else if (centerInTop) {
          // Top area
          clampedZone.x = Math.max(halfW, Math.min(topWidthX - halfW, zone.x));
          clampedZone.y = Math.max(bottomDepthZ + halfH, Math.min(bottomDepthZ + topDepthZ - halfH, zone.y));
        } else {
          // Zone center outside valid region - move to nearest
          if (zone.y < bottomDepthZ) {
            clampedZone.x = (bottomLeft + bottomRight) / 2;
            clampedZone.y = bottomDepthZ / 2;
          } else {
            clampedZone.x = topWidthX / 2;
            clampedZone.y = bottomDepthZ + topDepthZ / 2;
          }
        }
        break;
      }

      case 'rect':
      default: {
        const { widthX, depthZ } = config;
        clampedZone.x = Math.max(halfW, Math.min(widthX - halfW, zone.x));
        clampedZone.y = Math.max(halfH, Math.min(depthZ - halfH, zone.y));
        break;
      }
    }

    console.log('[ThreeViewer] Zone clamped:', { original: zone, clamped: clampedZone });
    return clampedZone;
  }

  isPointInContainer(x, y) {
    const config = this.containerConfig;
    if (!config) return false;

    switch (config.shape) {
      case 'rect':
        return x >= 0 && x <= config.widthX && y >= 0 && y <= config.depthZ;

      case 'u_shape': {
        const { outerWidthX, outerDepthZ, gapWidthX, gapDepthZ } = config;
        if (x < 0 || x > outerWidthX || y < 0 || y > outerDepthZ) return false;
        const gapLeft = (outerWidthX - gapWidthX) / 2;
        const gapRight = (outerWidthX + gapWidthX) / 2;
        const gapTop = outerDepthZ - gapDepthZ;
        if (x >= gapLeft && x <= gapRight && y >= gapTop && y <= outerDepthZ) {
          return false; // In gap
        }
        return true;
      }

      case 't_shape': {
        const { topWidthX, topDepthZ, bottomWidthX, bottomDepthZ } = config;
        const bottomLeft = (topWidthX - bottomWidthX) / 2;
        const bottomRight = bottomLeft + bottomWidthX;

        if (y >= 0 && y <= bottomDepthZ) {
          return x >= bottomLeft && x <= bottomRight;
        }
        if (y > bottomDepthZ && y <= bottomDepthZ + topDepthZ) {
          return x >= 0 && x <= topWidthX;
        }
        return false;
      }

      default:
        return false;
    }
  }

  drawContainer(containerConfig) {
    const shape = containerConfig.shape || 'rect';

    // DEBUG: Detailed container shape detection logging
    console.log('━━━━━━ THREE VIEWER - DRAW CONTAINER ━━━━━━');
    console.log('[ThreeViewer] Config received:', containerConfig);
    console.log('[ThreeViewer] containerConfig.shape:', containerConfig.shape);
    console.log('[ThreeViewer] containerConfig.parameters?.shape:', containerConfig.parameters?.shape);
    console.log('[ThreeViewer] Detected shape:', shape);
    console.log('[ThreeViewer] Config keys:', Object.keys(containerConfig));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    switch (shape) {
      case 'u_shape':
        this.drawUShapeContainer(containerConfig);
        break;
      case 't_shape':
        this.drawTShapeContainer(containerConfig);
        break;
      case 'rect':
      default:
        const width = containerConfig.widthX || containerConfig.parameters?.widthX || 5800;
        const height = containerConfig.heightY || containerConfig.parameters?.heightY || 2400;
        const depth = containerConfig.depthZ || containerConfig.parameters?.depthZ || 2300;
        this.drawRectContainer(width, height, depth);
        break;
    }
  }

  drawRectContainer(width, height, depth) {
    console.log('[ThreeViewer] Drawing rectangular container:', { width, height, depth });

    const container = this.createContainerBox(width, height, depth);

    // Position container so its bottom-min-corner is at 0,0,0
    // Geometry is centered.
    container.position.set(width / 2, height / 2, depth / 2);
    container.userData.isDynamic = true;

    this.sceneObjects.container.push(container);
    this.scene.add(container);
  }

  drawUShapeContainer(config) {
    const outerWidth = config.outerWidthX || config.parameters?.outerWidthX || 5800;
    const outerDepth = config.outerDepthZ || config.parameters?.outerDepthZ || 2300;
    const gapWidth = config.gapWidthX || config.parameters?.gapWidthX || 1000;
    const gapDepth = config.gapDepthZ || config.parameters?.gapDepthZ || 800;
    const height = config.heightY || config.parameters?.heightY || 2400;

    console.log('[ThreeViewer] Drawing U-shape container:', { outerWidth, outerDepth, gapWidth, gapDepth, height });

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

    // Material
    const material = new THREE.MeshStandardMaterial({
      color: 0xc4a57b,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      metalness: 0.1,
      roughness: 0.8
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.isDynamic = true;
    this.scene.add(mesh);
    this.sceneObjects.container.push(mesh);

    // Add edges
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x8b6f47, linewidth: 2 })
    );
    line.userData.isDynamic = true;
    this.scene.add(line);
    this.sceneObjects.container.push(line);
  }

  drawTShapeContainer(config) {
    const topWidth = config.topWidthX || config.parameters?.topWidthX || 4000;
    const bottomWidth = config.bottomWidthX || config.parameters?.bottomWidthX || 1500;
    const topDepth = config.topDepthZ || config.parameters?.topDepthZ || 1500;
    const bottomDepth = config.bottomDepthZ || config.parameters?.bottomDepthZ || 4000;
    const height = config.heightY || config.parameters?.heightY || 2400;

    console.log('[ThreeViewer] Drawing T-shape container:', { topWidth, bottomWidth, topDepth, bottomDepth, height });

    // Create T-shape using THREE.Shape
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

    // 旋轉後，擠出的高度方向變成 -Y，需要向上平移使底部在 Y=0
    geometry.translate(0, height, 0);

    // Material
    const material = new THREE.MeshStandardMaterial({
      color: 0xc4a57b,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      metalness: 0.1,
      roughness: 0.8
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.isDynamic = true;
    this.scene.add(mesh);
    this.sceneObjects.container.push(mesh);

    // Add edges
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x8b6f47, linewidth: 2 })
    );
    line.userData.isDynamic = true;
    this.scene.add(line);
    this.sceneObjects.container.push(line);
  }

  drawZones(zones) {
    if (!zones || zones.length === 0) return;

    zones.forEach((zone, index) => {
      const zoneWidth = zone.length || 1000;
      const zoneHeight = zone.height || 2400;
      const zoneDepth = zone.width || 1000;
      const cornerX = zone.x || 0;
      const cornerZ = zone.y || 0;

      const geometry = new THREE.BoxGeometry(zoneWidth, zoneHeight, zoneDepth);
      const material = new THREE.MeshBasicMaterial({
        color: this.getZoneColor(index),
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);

      const edges = new THREE.EdgesGeometry(geometry);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: this.getZoneColor(index), transparent: true, opacity: 0.5 })
      );

      const centerX = cornerX + zoneWidth / 2;
      const centerY = zoneHeight / 2;
      const centerZ = cornerZ + zoneDepth / 2;

      mesh.position.set(centerX, centerY, centerZ);
      line.position.set(centerX, centerY, centerZ);

      mesh.userData.isDynamic = true;
      line.userData.isDynamic = true;

      this.scene.add(mesh);
      this.scene.add(line);
      this.sceneObjects.zones.push(mesh, line);
    });
  }

  // --- CHANGED: Use Worker for Items ---
  drawItems(items) {
    if (!this.worker) {
      console.warn('Worker not ready, falling back to simple draw or error');
      return;
    }

    console.log(`[ThreeViewer] Offloading ${items.length} items to worker...`);

    // We send the raw items to worker.
    // Worker will handle matrix calculation.
    this.worker.postMessage({
      type: 'BUILD_GEOMETRY',
      items: items,
      maxCount: items.length
    });
  }

  updateInstancedMesh(matrices, colors, count) {
    // 1. Dispose old if any (already handled in clearScene, but safe check)
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
    }

    // 2. Create Geometry & Material
    // Unit cube 1x1x1
    const geometry = new THREE.BoxGeometry(1, 1, 1);

    // Industrial Plastic Material from createIndustrialBox
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, // Color comes from instanceColor
      roughness: 0.1,
      metalness: 0.1,
      transparent: true, // If we want transparency
      opacity: 0.9,
      side: THREE.DoubleSide
    });

    // 3. Create InstancedMesh
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    this.instancedMesh.instanceMatrix.array = matrices;
    this.instancedMesh.instanceMatrix.needsUpdate = true; // Just set, but array replacement usually needs 'needsUpdate'

    // 4. Instance Colors
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.array = colors;
      this.instancedMesh.instanceColor.needsUpdate = true;
    } else {
      // Init buffer if not auto-created (Three r128+ usually does if count passed)
      // But setting .array directly requires attribute to exist.
      // It's safer to use setColorAt loop if we weren't doing zero-copy, 
      // but for zero-copy we replace the buffer attribute.
      // InstancedMesh constructor creates the attribute.
      const colorAttribute = new THREE.InstancedBufferAttribute(colors, 3);
      this.instancedMesh.geometry.setAttribute('instanceColor', colorAttribute); // Or assign to property?
      // Actually Three.js `instanceColor` property is the attribute.
      this.instancedMesh.instanceColor = colorAttribute;
    }

    // Cast/Receive Shadow
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;
    this.instancedMesh.frustumCulled = false; // Optimization: avoid per-instance cull, just cull processing

    this.scene.add(this.instancedMesh);

    // Fit Camera for the first time
    this.fitCameraToScene();

    console.log('[ThreeViewer] InstancedMesh updated on GPU');
    this.requestRender();
  }

  getItemColor(item) { /* Worker handles this now */ }

  getZoneColor(index) {
    const colors = [
      0x00d2ff, 0x00ff9d, 0xff9f00, 0xff0055, 0xf6ff00
    ];
    return colors[index % colors.length];
  }

  fitCameraToScene() {
    const box = new THREE.Box3();

    // Expand by static objects
    [...this.sceneObjects.container, ...this.sceneObjects.zones].forEach(obj => box.expandByObject(obj));

    // Expand by InstancedMesh
    if (this.instancedMesh) {
      // Need to compute bounding box of instances, or just use container size?
      // InstancedMesh boundingSphere is default null/sphere.
      // Let's rely on container size usually, or update bounding sphere.
      // For accurate fit, we should use the bounding box of all items, which we know from the worker input...
      // But traversing 10,000 matrices to find max extends is heavy.
      // Simpler: Just fit to container + zones. That usually covers everything.
      // Items shouldn't be outside container ideally.
    }

    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const distance = maxDim * 1.5;
    this.camera.position.set(center.x + distance, center.y + distance * 0.8, center.z + distance);
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();
  }

  toggleFullscreen() { /* ... */ }
  openFullscreen() { /* ... */ }
  closeFullscreen() { /* ... */ }

  toggleContainer(v) {
    this.sceneObjects.container.forEach(o => o.visible = v);
  }
  toggleZones(v) {
    this.sceneObjects.zones.forEach(o => o.visible = v);
  }
  toggleItems(v) {
    if (this.instancedMesh) this.instancedMesh.visible = v;
    this.sceneObjects.items.forEach(o => o.visible = v); // fallback
  }

  createContainerBox(width, height, depth) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.05,
      side: THREE.BackSide,
      depthWrite: false
    });
    const container = new THREE.Mesh(geometry, material);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x64748b, opacity: 0.5, transparent: true })
    );
    container.add(edges);
    return container;
  }

  dispose() {
    console.log('[ThreeViewer] Disposing...');

    // 1. Stop Loop
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // 2. Kill Worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // 3. Remove Events
    window.removeEventListener('resize', this._resizeHandler);

    // 4. Dispose Scene
    this.clearScene();
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
          else object.material.dispose();
        }
      });
      this.scene = null;
    }

    // 5. Dispose Renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }

    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
  }
} // End Class
