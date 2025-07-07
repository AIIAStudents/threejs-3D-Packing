import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { add } from 'three/tsl';


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


// ball-> objects
const  gui = new dat.GUI();
let objectCount = 0;

const objects = []

function createIcosahedron(radius, detail) {
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    const material = new THREE.MeshStandardMaterial({
        color: 0xfff5e7,
        flatShading: true,
    });
    return new THREE.Mesh(geometry, material);
}

function updateGeometry(mesh, radius, detail) {
    const newGeometry = new THREE.IcosahedronGeometry(radius, detail);
    mesh.geometry.dispose(); 
    mesh.geometry = newGeometry; 
}

function addObject(){
    const default_parameters_settings = {
        radius: 10,  // 1-20
        detail: 0,  // 0-5
    }
    const mesh = createIcosahedron(default_parameters_settings.radius, default_parameters_settings.detail);
    mesh.position.x = (objectCount % 5) * 25 - 50;
    mesh.position.y = -Math.floor(objectCount / 5) * 25;
    objectCount++;
    scene.add(mesh);
    objects.push(mesh);

    //createIcosahedron(radius, detail)
    const folder = gui.addFolder(`Object ${objectCount}`);
    folder.add(default_parameters_settings, 'radius', 1, 20)
        .step(0.228)
        .onChange((value) => {
            updateGeometry(mesh, value, default_parameters_settings.detail);
        });
    folder.add(default_parameters_settings, 'detail', 0, 5)
        .step(1)
        .onChange((value) => {
            updateGeometry(mesh, default_parameters_settings.radius, value);
        });
    folder.open();
}

const btn = document.getElementById("add-object-btn");
btn.addEventListener("click", (e) => {
    e.preventDefault();  // 避免 <a href="#"> 預設跳轉
    addObject();
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