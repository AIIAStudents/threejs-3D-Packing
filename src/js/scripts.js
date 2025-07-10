import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addObject_createIcosahedron } from './3js_shape_file/Icosahedron';
import { addObject_createSphere } from './3js_shape_file/sphere';
import { addObject_createcube } from './3js_shape_file/cube';

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


const controls = new TrackballControls(camera, renderer.domElement, scene);
controls.noPan = false;      // 平移
controls.noZoom = false;     // 縮放
controls.noRotate = false;   // 旋轉
controls.enabled = false;       // 初始禁用控制
controls.rotateSpeed = 5.0;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;

window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    controls.enabled = true;
  }
});

window.addEventListener('keyup', (e) =>  {
  if (e.key === 'Tab') {
    controls.enabled = false;
  }
});


// create a boundary box
const boundarySize = 100;
const boundaryBox = new THREE.Mesh(
  new THREE.BoxGeometry(boundarySize, boundarySize, boundarySize),
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.2
  })
);
scene.add(boundaryBox);

// // GLTFLoader
// const loader = new GLTFLoader().setPath('src/assets/background/shipping_container/');
// loader.load('scene.gltf', (gltf) => {
//   const container = gltf.scene;
//   container.scale.set(boundarySize, boundarySize, boundarySize);
//   container.position.set(0, 0, 0);
//   scene.add(container);

//   // ✅ 防止 container 擋住滑鼠事件
//   container.traverse((child) => {
//     if (child.isMesh) {
//       child.material.depthWrite = false;
//       child.material.transparent = true;
//       child.material.opacity = 1; // 保持可見
//       child.renderOrder = -1;     // 放在最底層
//     }
//   });
// });

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

    plane.setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(plane.normal),
      selectedObject.position
    );

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
    const center = boundaryBox.position;

    newPos.x = THREE.MathUtils.clamp(newPos.x, center.x - half, center.x + half);
    newPos.y = THREE.MathUtils.clamp(newPos.y, center.y - half, center.y + half);
    newPos.z = THREE.MathUtils.clamp(newPos.z, center.z - half, center.z + half);

  selectedObject.position.copy(newPos);
}
canvas.addEventListener('pointerup', () => {
  if (controls.enabled) return;
  selectedObject = null;
  isDragging = false;
});
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
  const delta = now - lastFrameTime;
  if (delta < frameInterval) return;

  lastFrameTime = now;
  controls.update();

  // 動畫 + 渲染邏輯
  renderer.render(scene, camera);
}
animate();
