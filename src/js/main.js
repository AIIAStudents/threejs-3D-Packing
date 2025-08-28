import * as THREE from 'three';
import * as CANNON from 'cannon-es';
// mouse controls
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
// scene configuration
import { initPhysics, updatePhysics, addPhysicsObject, removePhysicsObject, world } from './utils/physics.js';
// 模組
import { ObjectManager } from './modules/objectManager.js';
import { MouseControls } from './modules/mouseControls.js';
import { PackingManager } from './modules/packingManager/packingManager.js';
import { ObjectCreator } from './modules/objectCreator.js'; // 已整合至 ObjectManager
// 3D Bin Packing API
import {
  requestBinPacking,
  pollJobUntilComplete,
} from './utils/binPackingAPI.js';

// 全局變數
let scene, camera, renderer, controls;
let objectManager, mouseControls, packingManager;


// 容器尺寸與邊界
const boundarySize = 120;

// 邊界可視化（Three.js）
function createDefaultBoundary() {
  const geometry = new THREE.BoxGeometry(boundarySize, boundarySize, boundarySize);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,           // 不寫入深度，避免遮擋
    side: THREE.BackSide         // 渲染內壁
  });
  const boundary = new THREE.Mesh(geometry, material);
  boundary.position.set(0, 60, 0);
  boundary.renderOrder = 0;
  scene.add(boundary);

  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x000000,
    depthTest: false             // 永遠顯示在線上層
  });
  const line = new THREE.LineSegments(edges, lineMaterial);
  line.position.copy(boundary.position);
  line.renderOrder = 2;
  scene.add(line);

  return boundary;
}

// 邊界碰撞體（Cannon）
function createBoundaryWalls(world, size) {
  const half = size / 2;
  const thickness = 1;
  const material = new CANNON.Material();

  const createWall = (position, rotation, halfExtents) => {
    const shape = new CANNON.Box(new CANNON.Vec3(...halfExtents));
    const body = new CANNON.Body({ mass: 0, shape, material });
    body.position.set(...position);
    if (rotation) body.quaternion.setFromEuler(...rotation);
    world.addBody(body);
  };

  // 下、上、左、右、前、後（以 y=60 為中心）
  createWall([0, 60 - half - thickness, 0], null, [half, thickness, half]);
  createWall([0, 60 + half + thickness, 0], null, [half, thickness, half]);
  createWall([-half - thickness, 60, 0], null, [thickness, half, half]);
  createWall([half + thickness, 60, 0], null, [thickness, half, half]);
  createWall([0, 60, -half - thickness], null, [half, half, thickness]);
  createWall([0, 60, half + thickness], null, [half, half, thickness]);
}

// 初始化 Three.js 與場景
function initThreeJS() {
  console.log('Initializing Three.js...');

  // 1) 物理引擎先初始化，讓 world 可用
  initPhysics();

  // 2) 場景、相機、渲染器
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    (window.innerWidth - 300) / window.innerHeight,
    0.01,
    2000
  );
  camera.position.set(120, 120, 240);
  camera.lookAt(60, 60, 120);
  camera.updateProjectionMatrix();
  
  // 相機位置、觀察目標、寬高比
  console.log('Camera position set to:', camera.position);
  console.log('Camera target:', new THREE.Vector3(0, 0, 0));
  console.log('Camera aspect ratio:', camera.aspect);
  // 背景顏色
  scene.background = new THREE.Color(0xffffff);

  // 渲染器
  const canvas = document.getElementById('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // 渲染器大小
  const width = window.innerWidth - 300;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);

  // 燈光
  const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(50, 50, 50);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);

  // 地板
  const floorGeometry = new THREE.PlaneGeometry(200, 200);
  const floorMaterial = new THREE.MeshLambertMaterial({
    color: 0xf8f8ff,
    transparent: true,
    opacity: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  // 地面網格
  const gridHelper = new THREE.GridHelper(200, 40, 0xf8f8ff, 0xf8f8ff);
  gridHelper.position.y = 0.1;
  scene.add(gridHelper);

  // 控制器
  controls = new TrackballControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.rotateSpeed = 2.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;

  // 3) 先有 scene/world，再建立邊界
  const defaultBoundary = createDefaultBoundary();
  createBoundaryWalls(world, boundarySize);

  // 4) 初始化模組（需要 scene、camera、renderer 等）
  objectManager = new ObjectManager(scene, animate); // 傳入 scene 和 render callback
  packingManager = new PackingManager(objectManager);
  objectManager.setPackingManager(packingManager); // 建立兩者之間的關聯
  mouseControls = new MouseControls(camera, renderer, objectManager, controls);

  // 5) 對外掛載參考（可用於除錯）
  window.scene = scene;
  window.camera = camera;
  window.renderer = renderer;
  window.addPhysicsObject = addPhysicsObject;
  window.removePhysicsObject = removePhysicsObject;
  window.requestBinPacking = requestBinPacking;
  window.pollJobUntilComplete = pollJobUntilComplete;
  window.objectManager = objectManager;

  // 6) 啟動渲染循環與事件
  animate();
  window.addEventListener('resize', onWindowResize);

  // 7) 設置 UI 事件
  setupEventListeners();
}

// 視窗調整
function onWindowResize() {
  const rightCanvas = document.getElementById('right-canvas');
  const width = rightCanvas.clientWidth;
  const height = rightCanvas.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

// 初始化可調整寬度的側邊欄
function initResizer() {
  const resizer = document.getElementById('resizer');
  const leftSidebar = document.getElementById('left-sidebar');
  const rightCanvas = document.getElementById('right-canvas');

  if (resizer && leftSidebar && rightCanvas) {
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
      if (!isResizing) return;

      const newWidth = e.clientX;
      const minWidth = parseInt(getComputedStyle(leftSidebar).minWidth, 10);
      const maxWidth = parseInt(getComputedStyle(leftSidebar).maxWidth, 10);

      if (newWidth > minWidth && newWidth < maxWidth) {
        leftSidebar.style.width = `${newWidth}px`;
        onWindowResize(); // 重新計算 canvas 大小
      }
    }

    function onMouseUp() {
      isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }
}

// UI 事件
function setupEventListeners() {
  const addItemBtn = document.getElementById('add-item-btn');
  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
      objectManager.showCreatePanel();
    });
  }

  const executePackingBtn = document.getElementById('execute-packing-btn');
  if (executePackingBtn) {
    executePackingBtn.addEventListener('click', () => {
      packingManager.executePacking();
    });
  }

  const closeItemToolbar = document.getElementById('close-item-toolbar');
  if (closeItemToolbar) {
    closeItemToolbar.addEventListener('click', () => {
      document.getElementById('item-toolbar').style.display = 'none';
    });
  }

  const closePackingPanel = document.getElementById('close-packing-panel');
  if (closePackingPanel) {
    closePackingPanel.addEventListener('click', () => {
      document.getElementById('packing-panel').style.display = 'none';
    });
  }

  const cancelPackingBtn = document.getElementById('cancel-packing-btn');
  if (cancelPackingBtn) {
    cancelPackingBtn.addEventListener('click', () => {
      packingManager.cancelPacking();
    });
  }
}

// 動畫循環
function animate() {
  requestAnimationFrame(animate);

  if (packingManager && packingManager.physicsEnabled) {
    updatePhysics();
  }

  controls.update();

  // 強制更新所有物件矩陣
  if (objectManager) {
    objectManager.getObjects().forEach(obj => {
      if (obj.mesh) {
        obj.mesh.updateMatrix();
        obj.mesh.updateMatrixWorld(true);
      }
    });
  }

  renderer.render(scene, camera);
}


// 等待 DOM 後啟動（單一入口）
document.addEventListener('DOMContentLoaded', () => {
  initThreeJS();
  initResizer();
});