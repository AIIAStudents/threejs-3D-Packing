import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


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


const btn = document.getElementById("add-object-btn");
btn.addEventListener("click", (e) => {
    e.preventDefault();  // 避免 <a href="#"> 預設跳轉
    addObject();
});

const balls = [];

function addObject(){
    const geometry = new THREE.IcosahedronGeometry( 10.5, 5);
    const material = new THREE.MeshStandardMaterial({
        color: 0xfff5e7,
        flatShading: true,
    });
    const Ball = new THREE.Mesh( geometry, material );
    scene.add(Ball);
    balls.push(Ball);        
}


function animate() {
    requestAnimationFrame( animate );

    balls.forEach((ball) => {
        ball.rotation.x += 0.00001;
        ball.rotation.y += 0.00001;
    });

    renderer.render( scene, camera );
}