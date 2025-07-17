import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { initPhysics, updatePhysics, createSphereBody, world } from './physics.js';
import { physicsObjects } from './physics.js'; 
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addObject_createIcosahedron } from './3js_shape_file/Icosahedron';
import { addObject_createSphere } from './3js_shape_file/sphere';
import { addObject_createcube } from './3js_shape_file/cube';
import { addObject_createIrregular } from './3js_shape_file/Irregular';
import { addObject_createCylinder } from './3js_shape_file/cylinder';

// initialize scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 
    75,
    window.innerWidth / window.innerHeight, 
    0.1,
    1000
);
camera.position.z = 50;
scene.background = null; // no background color

// initialize physics engine
initPhysics();

// create renderer
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true 
});
renderer.setPixelRatio(window.devicePixelRatio);

function onWindowResize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener('resize', onWindowResize);
onWindowResize();

//environmental background
const skycolor = new THREE.Color( 0xffffff );
const groundcolor = new THREE.Color( 0x000000);
const light = new THREE.HemisphereLight( skycolor, groundcolor, 1 );
scene.add(light);

// controller
const controls = new TrackballControls(camera, renderer.domElement, scene);
controls.noPan = false;      // 平移
controls.noZoom = false;     // 縮放
controls.noRotate = false;   // 旋轉
controls.enabled = false;       // 初始禁用控制
controls.rotateSpeed = 5.0;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;

window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') {
    controls.enabled = true;
  }
});

window.addEventListener('keyup', (e) =>  {
  if (e.key === 'Shift') {
    controls.enabled = false;
  }
});

const boundarySize = 150;
function createBoundaryWalls(world, size) {
  const half = size / 2;
  const thickness = 1;
  const material = new CANNON.Material();

  const createWall = (position, rotation, size) => {
    const shape = new CANNON.Box(new CANNON.Vec3(...size));
    const body = new CANNON.Body({ mass: 0, shape, material });
    body.position.set(...position);
    if (rotation) body.quaternion.setFromEuler(...rotation);
    world.addBody(body);
  };

  createWall([0, -half - thickness, 0], null, [half, thickness, half]);
  createWall([0, half + thickness, 0], null, [half, thickness, half]);
  createWall([-half - thickness, 0, 0], null, [thickness, half, half]);
  createWall([half + thickness, 0, 0], null, [thickness, half, half]);
  createWall([0, 0, -half - thickness], null, [half, half, thickness]);
  createWall([0, 0, half + thickness], null, [half, half, thickness]);
}
createBoundaryWalls(world, boundarySize);

// BoxHelper 顯示虛擬邊框
const boxHelper = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(boundarySize, boundarySize, boundarySize)), 0x00ffff);
scene.add(boxHelper);

// object settings
let objectCount = 0;
const objects = [];
const gui = new dat.GUI({ autoPlace: false });
document.getElementById("dat-gui-container").appendChild(gui.domElement);
gui.domElement.style.position = 'absolute';
gui.domElement.style.top = '80px';  // 高於 toolbar 底部
gui.domElement.style.right = '20px';

const guiFolders = new Map(); // 儲存物件與對應 folder

dat.GUI.prototype.removeFolder = function(nameOrFolder) {
  const folder = typeof nameOrFolder === 'string'
    ? this.__folders[nameOrFolder]
    : nameOrFolder;

  if (!folder) return;

  folder.close();
  this.__ul.removeChild(folder.domElement.parentNode);
  delete this.__folders[folder.name];
  this.onResize();
};

function addObjectToList(name, object) {
  const li = document.createElement('li');
  li.textContent = name;
  li.addEventListener('click', () => {
    guiFolders.forEach(folder => folder.domElement.style.display = 'none');
    const folder = guiFolders.get(object);
    if (folder) folder.domElement.style.display = '';
    selectedObject = object; // 點選後可以直接拖曳
  });
  document.getElementById('object-list').appendChild(li);
}


// show icon toolbar interface
document.addEventListener('click', (e) => {
  const target = e.target.closest('.icon-wrapper');
  if (!target) return;
  const type = target.dataset.type;

  switch (type) {
    case 'icosahedron':
      objectCount = addObject_createIcosahedron(objectCount, scene, objects, gui, addObjectToList, guiFolders);
      break;
    case 'sphere':
      objectCount = addObject_createSphere(objectCount, scene, objects, gui, addObjectToList, guiFolders);
      break;
    case 'cube':
      objectCount = addObject_createcube(objectCount, scene, objects, gui, addObjectToList, guiFolders);
      break;
    case 'mysterybox':
      objectCount = addObject_createIrregular(objectCount, scene, objects, gui, addObjectToList, guiFolders);
      break;
    case 'cylinder':
      objectCount = addObject_createCylinder(objectCount, scene, objects, gui, addObjectToList, guiFolders);
      break;
  }
});

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selectedObject = null;
let offset = new THREE.Vector3();
let plane = new THREE.Plane();
let isDragging = false;

canvas.addEventListener('pointerdown', (event) => {
  if (controls.enabled) return;

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(objects, true);

  if (intersects.length > 0) {
    selectedObject = intersects[0].object;
    isDragging = true;

    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(plane.normal), selectedObject.position);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);
    offset.copy(intersection).sub(selectedObject.position);
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (controls.enabled || !isDragging || !selectedObject) return;;

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersection = new THREE.Vector3();

  if (raycaster.ray.intersectPlane(plane, intersection)) {
    const newPos = intersection.sub(offset);
    const half = boundarySize / 2;

    newPos.x = THREE.MathUtils.clamp(newPos.x, -half, half);
    newPos.y = THREE.MathUtils.clamp(newPos.y, -half, half);
    newPos.z = THREE.MathUtils.clamp(newPos.z, -half, half);

    selectedObject.position.copy(newPos);

    // 同步剛體位置
    const obj = physicsObjects.find(o => o.mesh === selectedObject);
    if (obj) {
      obj.body.position.copy(newPos);
      obj.body.velocity.set(0, 0, 0);
    }
  }
});

canvas.addEventListener('pointerup', () => {
  selectedObject = null;
  isDragging = false;
});

//降低每秒渲染次數
let lastFrameTime = 0;
const fps = 60;
const frameInterval = 1000 / fps;

function animate(now = 0) {
  requestAnimationFrame(animate);

  updatePhysics();

  const delta = now - lastFrameTime;
  if (delta < frameInterval) return;

  lastFrameTime = now;
  controls.update();

  // 動畫 + 渲染邏輯
  renderer.render(scene, camera);
}
animate();
