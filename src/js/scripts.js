import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addObject_createIcosahedron } from './3js_shape_file/Icosahedron';


// initialize scene, camera, and renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera( 
    75,
    window.innerWidth / window.innerHeight, 
    0.1,
    1000
);
camera.position.z = 50;

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

// controls (mouse movement)
const orbit = new OrbitControls( camera, renderer.domElement );
orbit.update();


//environmental background
const skycolor = new THREE.Color( 0xffffff );
const groundcolor = new THREE.Color( 0x000000);
const light = new THREE.HemisphereLight( skycolor, groundcolor, 1 );
scene.add(light);

// object settings

let objectCount = 0;
const objects = [];
const  gui = new dat.GUI();
gui.domElement.style.position = 'absolute';
gui.domElement.style.top = '80px';  // 高於 toolbar 底部
gui.domElement.style.right = '20px';


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


// show icon toolbar interface
iconToolbar = document.addEventListener('click', (e) => {
    const target = e.target.closest('.icon-wrapper');    
    if(!target) return;

    const type = target.dataset.type;

    switch(type) {
        case 'icosahedron': 
            objectCount = addObject_createIcosahedron(objectCount, scene, objects, gui);
            break;
    }
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