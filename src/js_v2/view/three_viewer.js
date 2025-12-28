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
    this.isFullscreen = false;
  }

  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();
    this.setupLights();
    this.animate();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8f5f2);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(5000, 50, 0xcccccc, 0xeeeeee);
    this.scene.add(gridHelper);

    // Add axes helper
    const axesHelper = new THREE.AxesHelper(1000);
    this.scene.add(axesHelper);
  }

  setupCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 1, 20000);
    this.camera.position.set(3000, 3000, 3000);
    this.camera.lookAt(0, 0, 0);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 500;
    this.controls.maxDistance = 10000;
    this.controls.maxPolarAngle = Math.PI / 2;
  }

  setupLights() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(2000, 3000, 1000);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);

    // Hemisphere light
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    this.scene.add(hemisphereLight);
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
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
  }

  clearScene() {
    // Remove all meshes except helpers
    const objectsToRemove = [];
    this.scene.traverse((object) => {
      if (object.isMesh || (object.isLine && !object.isGridHelper && !object.isAxesHelper)) {
        objectsToRemove.push(object);
      }
    });
    objectsToRemove.forEach(obj => {
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
  }

  loadPackingResult(packingData) {
    console.log('[ThreeViewer] Loading packing result:', packingData);
    this.clearScene();

    if (packingData.container) {
      this.drawContainer(packingData.container);
    }

    if (packingData.zones && packingData.zones.length > 0) {
      this.drawZones(packingData.zones);
    }

    if (packingData.items && packingData.items.length > 0) {
      this.drawItems(packingData.items);
    }

    // Adjust camera to fit the scene
    this.fitCameraToScene();
  }

  drawContainer(containerConfig) {
    const shape = containerConfig.shape || 'rect';

    switch (shape) {
      case 'u_shape':
        this.drawUShapeContainer(containerConfig);
        break;
      case 't_shape':
        this.drawTShapeContainer(containerConfig);
        break;
      case 'rect':
      default:
        this.drawRectContainer(containerConfig);
        break;
    }
  }

  drawRectContainer(config) {
    const width = config.widthX || config.parameters?.widthX || 5800;
    const height = config.heightY || config.parameters?.heightY || 2400;
    const depth = config.depthZ || config.parameters?.depthZ || 2300;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x078080, linewidth: 2 })
    );
    line.position.set(width / 2, height / 2, depth / 2);
    this.scene.add(line);
  }

  drawUShapeContainer(config) {
    const outerWidth = config.outerWidthX || 5800;
    const outerDepth = config.outerDepthZ || 2300;
    const gapWidth = config.gapWidthX || 1000;
    const gapDepth = config.gapDepthZ || 800;
    const height = config.heightY || 2400;

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
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x078080, linewidth: 2 })
    );
    line.rotation.x = -Math.PI / 2;
    this.scene.add(line);
  }

  drawTShapeContainer(config) {
    const stemWidth = config.stemWidthX || 1000;
    const stemDepth = config.stemDepthZ || 3000;
    const crossWidth = config.crossWidthX || 2000;
    const crossDepth = config.crossDepthZ || 500;
    const crossOffset = config.crossOffsetZ || 1000;
    const height = config.heightY || 2400;

    const offsetX = (crossWidth - stemWidth) / 2;

    // Create T-shape using Shape
    const shape = new THREE.Shape();
    shape.moveTo(offsetX, 0);
    shape.lineTo(offsetX + stemWidth, 0);
    shape.lineTo(offsetX + stemWidth, crossOffset);
    shape.lineTo(crossWidth, crossOffset);
    shape.lineTo(crossWidth, crossOffset + crossDepth);
    shape.lineTo(0, crossOffset + crossDepth);
    shape.lineTo(0, crossOffset);
    shape.lineTo(offsetX, crossOffset);
    shape.lineTo(offsetX, 0);

    const extrudeSettings = {
      depth: height,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x078080, linewidth: 2 })
    );
    line.rotation.x = -Math.PI / 2;
    this.scene.add(line);
  }

  drawZones(zones) {
    zones.forEach((zone, index) => {
      const width = zone.width || zone.length || 1000;
      const height = zone.depth || zone.height || 2400;
      const depth = zone.height || zone.width || 1000;

      const x = zone.x || 0;
      const y = zone.y || 0;
      const rotation = zone.rotation || 0;

      // Create semi-transparent box for zone
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshBasicMaterial({
        color: this.getZoneColor(index),
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);

      // Create edges for zone
      const edges = new THREE.EdgesGeometry(geometry);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: this.getZoneColor(index), linewidth: 2 })
      );

      // Position the zone
      mesh.position.set(x, height / 2, y);
      line.position.set(x, height / 2, y);

      // Rotate if needed
      if (rotation) {
        mesh.rotation.y = rotation;
        line.rotation.y = rotation;
      }

      this.scene.add(mesh);
      this.scene.add(line);
    });
  }

  drawItems(items) {
    items.forEach(item => {
      if (!item.is_packed || !item.pose) return;

      const { min, max } = item.pose;
      const width = max.x - min.x;
      const height = max.y - min.y;
      const depth = max.z - min.z;

      const centerX = (min.x + max.x) / 2;
      const centerY = (min.y + max.y) / 2;
      const centerZ = (min.z + max.z) / 2;

      // Create box for item
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshPhongMaterial({
        color: 0x4caf50,
        transparent: true,
        opacity: 0.7
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(centerX, centerY, centerZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Create edges for item
      const edges = new THREE.EdgesGeometry(geometry);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x2e7d32 })
      );
      line.position.set(centerX, centerY, centerZ);

      this.scene.add(mesh);
      this.scene.add(line);
    });
  }

  getZoneColor(index) {
    const colors = [0xe91e63, 0x2196f3, 0x4caf50, 0xff9800, 0x9c27b0];
    return colors[index % colors.length];
  }

  fitCameraToScene() {
    const box = new THREE.Box3();
    this.scene.traverse((object) => {
      if (object.isMesh || object.isLine) {
        box.expandByObject(object);
      }
    });

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // Add some padding

    this.camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();
  }

  toggleFullscreen() {
    this.isFullscreen = !this.isFullscreen;

    if (this.isFullscreen) {
      this.openFullscreen();
    } else {
      this.closeFullscreen();
    }
  }

  openFullscreen() {
    // Create fullscreen modal if it doesn't exist
    let modal = document.getElementById('fullscreen-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'fullscreen-modal';
      modal.className = 'fullscreen-modal';
      modal.innerHTML = `
                <div class="fullscreen-content">
                    <button class="fullscreen-close" id="fullscreen-close-btn">×</button>
                </div>
            `;
      document.body.appendChild(modal);

      document.getElementById('fullscreen-close-btn').addEventListener('click', () => {
        this.toggleFullscreen();
      });

      // Close on ESC key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isFullscreen) {
          this.toggleFullscreen();
        }
      });
    }

    modal.classList.add('active');
    modal.querySelector('.fullscreen-content').appendChild(this.renderer.domElement);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  closeFullscreen() {
    const modal = document.getElementById('fullscreen-modal');
    if (modal) {
      modal.classList.remove('active');
    }

    this.container.appendChild(this.renderer.domElement);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.controls) {
      this.controls.dispose();
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    this.clearScene();
  }
}
