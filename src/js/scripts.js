import * as THREE from 'three';
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
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(objects);

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
  if (!isDragging || !selectedObject) return;

  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersection = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, intersection)) {
    selectedObject.position.copy(intersection.sub(offset));
  }
});

canvas.addEventListener('pointerup', () => {
  selectedObject = null;
  isDragging = false;
});


function animate() {
    requestAnimationFrame( animate );

    objects.forEach((object) => {
        object.rotation.x += 0.00001;
        object.rotation.y += 0.00001;
    });
    renderer.render( scene, camera );
}

animate();

renderer.setAnimationLoop( animate );